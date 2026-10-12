#!/usr/bin/env python3
"""Read-only post-copy reconciliation for FUN Profile.

Audit is the default operational mode.  This program never invokes the source
helper's --write mode and the apply subcommand is deliberately locked until a
separately reviewed transactional writer is added.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "migration-snapshot/28-migration-manifest.json"
SOURCE_HELPER = ROOT / "scripts/fun-sql.sh"
OUTPUT_DIR = ROOT / "migration-state/reconcile"
WORK_DIR = ROOT / "migration-state/.work/reconcile"
PAGE_SIZE = 1000
MIN_JWT_TTL_SECONDS = 900
AUDIT_TABLES = ("profiles", "posts", "live_sessions")
APPLY_STAGES = ("auth-deps", "profiles", "posts", "live_sessions")
TRANSACTION_MODES = ("apply", "rehearse")
AUTH_RELATION_ORDER = (("auth", "users"), ("auth", "identities"))
STAGE_TABLE = {"auth-deps": "profiles", "profiles": "profiles", "posts": "posts", "live_sessions": "live_sessions"}
PREVIOUS_STAGE = {"profiles": "auth-deps", "posts": "profiles", "live_sessions": "posts"}
POSTS_CUTOFF = "2026-09-23T09:34:04.592674+00:00"
LIVE_SESSIONS_CUTOFF = "2026-09-26T06:57:26.315742+00:00"
LIVE_SESSION_NULL_FIELDS = (
    "rtmp_config_id",
    "stream_key_encrypted",
    "armed_session_token",
    "rtmps_url",
    "cloudflare_live_input_id",
    "cloudflare_input_id",
)
LIVE_SESSION_FALSE_FIELDS = (
    "is_input_armed",
    "source_connected",
    "preview_ready",
)
POLICIES = {
    "app_secrets": "REBUILD_TARGET",
    "app_secrets_audit": "SKIP",
    "connector_config": "COPY",
    "connector_links": "COPY_NOOP_IF_EMPTY",
    "connector_windows": "SKIP_EPHEMERAL",
    "oauth_clients": "SPECIAL_ROTATE_METADATA_ONLY",
    "oauth_codes": "SKIP_EPHEMERAL",
    "rtmp_stream_configs": "REBUILD_ROTATE_NOT_COPIED",
    "app_stats_cache": "REBUILD_TARGET",
    "token_price_current": "REBUILD_TARGET",
    "link_preview_cache": "REBUILD_TARGET",
    "cross_platform_tokens": "SKIP_EPHEMERAL_REAUTHORIZE",
    "live_sessions": "HISTORICAL_WITH_RUNTIME_NEUTRALIZATION",
}
SENSITIVE_WORDS = re.compile(
    r"(password|passwd|jwt|token|secret|private[_ -]?key|authorization)", re.I
)


class AuditError(RuntimeError):
    pass


class ApplySafetyError(AuditError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_error(exc: BaseException) -> str:
    text = str(exc)
    if text == "JWT_REFRESH_REQUIRED":
        return text
    if SENSITIVE_WORDS.search(text):
        return "Lỗi chứa thông tin nhạy cảm đã được che; xem trạng thái preflight."
    return text[:1000]


def jwt_ttl_seconds(token: str | None = None, *, now: float | None = None) -> int:
    """Read only the JWT exp claim locally and return its remaining whole seconds."""
    encoded = token if token is not None else os.environ.get("FUN_JWT", "")
    try:
        parts = encoded.split(".")
        if len(parts) != 3 or not parts[1]:
            raise ValueError
        payload_bytes = base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        payload = json.loads(payload_bytes)
        exp = payload.get("exp")
        if isinstance(exp, bool) or not isinstance(exp, (int, float)):
            raise ValueError
        current = datetime.now(timezone.utc).timestamp() if now is None else now
        return int(exp - current)
    except (ValueError, TypeError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditError("JWT_REFRESH_REQUIRED") from exc


def require_fresh_jwt(token: str | None = None, *, now: float | None = None) -> int:
    ttl = jwt_ttl_seconds(token, now=now)
    if ttl < MIN_JWT_TTL_SECONDS:
        raise AuditError("JWT_REFRESH_REQUIRED")
    return ttl


def load_manifest() -> dict[str, dict[str, Any]]:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {row["table_name"]: row for row in data["tables"]}


def run_source_sql(sql: str) -> dict[str, Any]:
    if not os.environ.get("FUN_JWT"):
        raise AuditError("Thiếu biến môi trường xác thực source (giá trị không được in).")
    if "--write" in sql:
        raise AuditError("Source helper write mode is forbidden.")
    proc = subprocess.run(
        source_command(sql),
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        raise AuditError("Source read-only probe/query failed; output suppressed.")
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AuditError("Source returned invalid JSON; output suppressed.") from exc
    if payload.get("ok") is not True:
        raise AuditError("Source rejected read-only query; details suppressed.")
    return payload


def source_command(sql: str) -> list[str]:
    """The only source execution path; intentionally has no write-mode argument."""
    if "--write" in sql:
        raise ApplySafetyError("Source write mode is forbidden.")
    return ["bash", str(SOURCE_HELPER), sql]


POSTGRES_ERROR_CLASSES = {
    "08": "connection_exception",
    "22": "data_exception",
    "23": "integrity_constraint_violation",
    "28": "invalid_authorization_specification",
    "40": "transaction_rollback",
    "42": "syntax_error_or_access_rule_violation",
    "53": "insufficient_resources",
    "57": "operator_intervention",
}


def postgres_error_details(stderr: str) -> tuple[str, str, str]:
    match = re.search(r"^ERROR:\s+([0-9A-Z]{5}):\s*(.+)$", stderr, re.MULTILINE)
    if not match:
        return "unknown", "unknown", "PostgreSQL error detail unavailable or redacted."
    sqlstate, message = match.groups()
    if SENSITIVE_WORDS.search(message):
        message = "PostgreSQL message contained sensitive terms and was redacted."
    message = re.sub(r"(?i)(host|user|dbname|password)=[^\s]+", r"\1=[REDACTED]", message)
    return sqlstate, POSTGRES_ERROR_CLASSES.get(sqlstate[:2], "unknown"), message[:500]


def run_target_sql(sql: str, *, query_label: str) -> str:
    target = os.environ.get("TARGET")
    if not target:
        raise AuditError("Thiếu biến môi trường kết nối target (giá trị không được in).")
    proc = subprocess.run(
        ["psql", target, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At", "-c", sql],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        sqlstate, error_class, message = postgres_error_details(proc.stderr)
        raise AuditError(
            f"Target read-only query failed: query_label={query_label}; "
            f"return_code={proc.returncode}; sqlstate={sqlstate}; "
            f"error_class={error_class}; message={message}"
        )
    return proc.stdout


def run_target_transaction(script: str, *, query_label: str) -> str:
    target = os.environ.get("TARGET")
    if not target:
        raise ApplySafetyError("Thiếu biến môi trường kết nối target (giá trị không được in).")
    proc = subprocess.run(
        ["psql", target, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At"],
        cwd=ROOT,
        text=True,
        input=script,
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        sqlstate, error_class, message = postgres_error_details(proc.stderr)
        raise ApplySafetyError(
            f"Target transaction failed: query_label={query_label}; "
            f"return_code={proc.returncode}; sqlstate={sqlstate}; "
            f"error_class={error_class}; message={message}"
        )
    return proc.stdout


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sql_literal(value: Any, udt_name: str) -> str:
    if value is None:
        return "NULL"
    if udt_name in {"int2", "int4", "int8"}:
        return str(int(value))
    escaped = str(value).replace("'", "''")
    cast = {"uuid": "uuid", "text": "text", "date": "date", "timestamptz": "timestamptz"}.get(udt_name)
    if not cast:
        raise AuditError(f"Unsupported PK cursor type: {udt_name}")
    return f"'{escaped}'::{cast}"


def pk_sort_key(values: Sequence[Any], types: Sequence[str]) -> tuple[Any, ...]:
    result: list[Any] = []
    for value, typ in zip(values, types):
        result.append(int(value) if typ in {"int2", "int4", "int8", "smallint", "integer", "bigint"} else str(value))
    return tuple(result)


def tuple_after_clause(columns: Sequence[str], values: Sequence[Any], types: Sequence[str]) -> str:
    left = ", ".join(quote_ident(c) for c in columns)
    right = ", ".join(sql_literal(v, t) for v, t in zip(values, types))
    return f"({left}) > ({right})"


def paginate(fetch_page: Callable[[tuple[Any, ...] | None, int], list[dict[str, Any]]], pk_columns: Sequence[str], page_size: int = PAGE_SIZE) -> list[dict[str, Any]]:
    cursor: tuple[Any, ...] | None = None
    rows: list[dict[str, Any]] = []
    while True:
        page = fetch_page(cursor, page_size)
        if len(page) > page_size:
            raise AuditError("Source pagination exceeded the 1000-row Lane A limit.")
        if not page:
            break
        new_cursor = tuple(page[-1][column] for column in pk_columns)
        if cursor is not None and new_cursor <= cursor:
            raise AuditError("Source pagination cursor did not advance.")
        rows.extend(page)
        cursor = new_cursor
        if len(page) < page_size:
            break
    return rows


def generated_insert_columns(all_columns: Sequence[str], generated: Sequence[str]) -> list[str]:
    blocked = set(generated)
    return [column for column in all_columns if column not in blocked]


def restore_trigger_statements(table: str, states: Sequence[str]) -> list[str]:
    mapping = {"O": "ENABLE", "D": "DISABLE", "R": "ENABLE REPLICA", "A": "ENABLE ALWAYS"}
    statements = []
    for item in states:
        name, state = item.rsplit(":", 1)
        if state not in mapping:
            raise AuditError("Unknown trigger state.")
        statements.append(f"ALTER TABLE public.{quote_ident(table)} {mapping[state]} TRIGGER {quote_ident(name)};")
    return statements


def transform_live_session(row: dict[str, Any]) -> dict[str, Any]:
    transformed = dict(row)
    for column in LIVE_SESSION_NULL_FIELDS:
        transformed[column] = None
    for column in LIVE_SESSION_FALSE_FIELDS:
        transformed[column] = False
    return transformed


def exact_verification_or_rollback(expected: Sequence[Any], actual: Sequence[Any]) -> None:
    if list(expected) != list(actual):
        raise AuditError("Exact verification mismatch; transaction must roll back.")


def fingerprint_keys(keys: Iterable[Sequence[Any]]) -> str:
    digest = hashlib.sha256()
    for item in sorted(tuple(str(value) for value in row) for row in keys):
        digest.update(json.dumps(item, separators=(",", ":")).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def fingerprint_json(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def fingerprint_rows(rows: Sequence[dict[str, Any]], pk_columns: Sequence[str]) -> str:
    ordered = sorted(rows, key=lambda row: tuple(str(row[column]) for column in pk_columns))
    return fingerprint_json(ordered)


def validate_bounded_snapshot(
    saved: dict[str, Any],
    private: dict[str, Any],
    current_source_keys: set[tuple[str, ...]],
    intended_rows: Sequence[dict[str, Any]],
    target_intended_keys: set[tuple[str, ...]],
    dependency_fingerprint: str,
    dependency_blocker_count: int,
    *,
    enforce_source_set: bool = True,
) -> dict[str, Any]:
    bounded = saved.get("bounded_snapshot") or {}
    pk = saved.get("pk_columns") or []
    audit_source_keys = {tuple(str(value) for value in item) for item in private.get("source_keys_at_audit", [])}
    intended_keys = {tuple(str(value) for value in item) for item in private.get("intended_keys", [])}
    if fingerprint_keys(audit_source_keys) != bounded.get("source_set_fingerprint"):
        raise ApplySafetyError("BOUNDED_SNAPSHOT_INTEGRITY_FAILED: source set")
    if fingerprint_keys(intended_keys) != bounded.get("intended_pk_fingerprint"):
        raise ApplySafetyError("BOUNDED_SNAPSHOT_INTEGRITY_FAILED: intended set")
    if enforce_source_set and not audit_source_keys.issubset(current_source_keys):
        raise ApplySafetyError("BOUNDED_SOURCE_NON_ADDITIVE_DRIFT")
    row_keys = {key(row, pk) for row in intended_rows}
    if row_keys != intended_keys:
        raise ApplySafetyError("BOUNDED_INTENDED_ROW_MISSING")
    if fingerprint_rows(intended_rows, pk) != bounded.get("intended_payload_fingerprint"):
        raise ApplySafetyError("BOUNDED_INTENDED_PAYLOAD_CHANGED")
    if dependency_blocker_count or dependency_fingerprint != bounded.get("intended_dependency_fingerprint"):
        raise ApplySafetyError("BOUNDED_INTENDED_DEPENDENCY_CHANGED")
    if intended_keys & target_intended_keys:
        raise ApplySafetyError("BOUNDED_INTENDED_TARGET_DRIFT")
    return {
        "intended_keys": intended_keys,
        "source_total_at_audit": len(audit_source_keys),
        "source_total_at_freshness": len(current_source_keys) if enforce_source_set else None,
        "additive_rows_outside_intended": len(current_source_keys - audit_source_keys) if enforce_source_set else None,
        "intended_pk_fingerprint_match": True,
        "intended_payload_fingerprint_match": True,
        "dependency_fingerprint_match": True,
    }


def blocker_summary(source_only: set[tuple[str, ...]], source_map: dict[tuple[str, ...], dict[str, Any]], foreign_keys: Sequence[dict[str, Any]], parent_loader: Callable[[dict[str, Any]], set[tuple[str, ...]]]) -> tuple[dict[str, int], int, int, str]:
    per_fk: dict[str, int] = {}
    blocked_row_keys: set[tuple[str, ...]] = set()
    blocked_references = 0
    dependency_states: list[tuple[Any, ...]] = []
    for fk in foreign_keys:
        if fk["parent_schema"] not in {"public", "auth"}:
            continue
        parent_keys = parent_loader(fk)
        count = 0
        for row_key in source_only:
            values = tuple(source_map[row_key].get(column) for column in fk["columns"])
            if any(value is None for value in values):
                dependency_states.append((fk["name"], row_key, "null"))
                continue
            present = tuple(str(value) for value in values) in parent_keys
            dependency_states.append((fk["name"], row_key, "present" if present else "missing"))
            if not present:
                count += 1
                blocked_references += 1
                blocked_row_keys.add(row_key)
        per_fk[fk["name"]] = count
    return per_fk, len(blocked_row_keys), blocked_references, fingerprint_json(sorted(dependency_states))


@dataclass(frozen=True)
class TableShape:
    columns: list[dict[str, Any]]
    generated_columns: list[str]
    pk_columns: list[str]
    pk_types: list[str]
    triggers: list[str]
    foreign_keys: list[dict[str, Any]]


def target_shape(table: str) -> TableShape:
    sql = f"""
select jsonb_build_object(
  'columns', (select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',t.typname,'generated',a.attgenerated) order by a.attnum),'[]') from pg_attribute a join pg_type t on t.oid=a.atttypid where a.attrelid='public.{table}'::regclass and a.attnum>0 and not a.attisdropped),
  'pk', (select coalesce(jsonb_agg(a.attname order by u.ord),'[]') from pg_constraint c cross join lateral unnest(c.conkey) with ordinality u(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum where c.conrelid='public.{table}'::regclass and c.contype='p'),
  'triggers', (select coalesce(jsonb_agg(tgname||':'||tgenabled::text order by tgname),'[]') from pg_trigger where tgrelid='public.{table}'::regclass and not tgisinternal),
  'fks', (select coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'columns',(select jsonb_agg(a.attname order by u.ord) from unnest(c.conkey) with ordinality u(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum),'parent_schema',pn.nspname,'parent_table',p.relname,'parent_columns',(select jsonb_agg(a.attname order by u.ord) from unnest(c.confkey) with ordinality u(attnum,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)) order by c.conname),'[]') from pg_constraint c join pg_class p on p.oid=c.confrelid join pg_namespace pn on pn.oid=p.relnamespace where c.conrelid='public.{table}'::regclass and c.contype='f')
)::text;
"""
    payload = json.loads(run_target_sql(sql, query_label=f"target_shape:{table}").strip())
    type_by_name = {c["name"]: c["type"] for c in payload["columns"]}
    return TableShape(
        columns=payload["columns"],
        generated_columns=[c["name"] for c in payload["columns"] if c["generated"]],
        pk_columns=payload["pk"],
        pk_types=[type_by_name[name] for name in payload["pk"]],
        triggers=payload["triggers"],
        foreign_keys=payload["fks"],
    )


def source_scan(table: str, columns: Sequence[str], pk_columns: Sequence[str], pk_types: Sequence[str]) -> list[dict[str, Any]]:
    qcolumns = ", ".join(quote_ident(c) for c in columns)
    qorder = ", ".join(quote_ident(c) for c in pk_columns)

    def fetch(cursor: tuple[Any, ...] | None, limit: int) -> list[dict[str, Any]]:
        where = "" if cursor is None else "where " + tuple_after_clause(pk_columns, cursor, pk_types)
        result = run_source_sql(f"select {qcolumns} from public.{quote_ident(table)} {where} order by {qorder} asc limit {limit}")
        return result.get("rows", [])

    return paginate(fetch, pk_columns)


def target_scan(table: str, columns: Sequence[str], pk_columns: Sequence[str], *, schema: str = "public") -> list[dict[str, Any]]:
    qcolumns = ", ".join(quote_ident(c) for c in columns)
    qorder = ", ".join(quote_ident(c) for c in pk_columns)
    sql = f"select coalesce(jsonb_agg(to_jsonb(q) order by {qorder}),'[]')::text from (select {qcolumns} from {quote_ident(schema)}.{quote_ident(table)}) q;"
    return json.loads(run_target_sql(sql, query_label=f"target_scan:{schema}.{table}").strip())


def key(row: dict[str, Any], pk_columns: Sequence[str]) -> tuple[str, ...]:
    return tuple(str(row[c]) for c in pk_columns)


def target_parent_keys(fk: dict[str, Any]) -> set[tuple[str, ...]]:
    rows = target_scan(
        fk["parent_table"],
        fk["parent_columns"],
        fk["parent_columns"],
        schema=fk["parent_schema"],
    )
    return {tuple(str(row[c]) for c in fk["parent_columns"]) for row in rows}


def schema_findings(meta: dict[str, Any], shape: TableShape) -> list[str]:
    findings = []
    target_columns = [c["name"] for c in shape.columns]
    if target_columns != meta["all_columns"]:
        findings.append("Target columns/order differ from manifest.")
    if shape.generated_columns != meta.get("generated_columns", []):
        findings.append("Generated-column metadata differs from manifest.")
    if shape.pk_columns != meta["primary_key"]["columns"]:
        findings.append("Target primary key differs from manifest.")
    return findings


def audit_table(table: str, meta: dict[str, Any]) -> dict[str, Any]:
    shape = target_shape(table)
    pk = shape.pk_columns
    scan_columns = list(pk)
    if table == "posts":
        scan_columns += ["created_at", "user_id"]
    elif table == "profiles":
        scan_columns += ["preferred_language"]
    elif table == "live_sessions":
        scan_columns += ["host_user_id", "owner_id", "user_id", "post_id", "live_post_id", "replay_post_id", "rtmp_config_id", "created_at"]
    scan_columns = list(dict.fromkeys(scan_columns))
    source_rows = source_scan(table, scan_columns, pk, shape.pk_types)
    target_rows = target_scan(table, pk, pk)
    source_map = {key(row, pk): row for row in source_rows}
    source_keys, target_keys = set(source_map), {key(row, pk) for row in target_rows}
    source_only = source_keys - target_keys
    target_only = target_keys - source_keys
    common = source_keys & target_keys

    blockers, blocked_rows, blocked_references, dependency_fingerprint = blocker_summary(
        source_only, source_map, shape.foreign_keys, target_parent_keys
    )

    historical = None
    bounded_snapshot = None
    bounded_snapshot_private = None
    if table == "posts":
        before = sum(1 for row_key in source_only if str(source_map[row_key]["created_at"]) <= POSTS_CUTOFF)
        historical = {
            "cutoff": POSTS_CUTOFF,
            "source_only_at_or_before_cutoff": before,
            "source_only_after_cutoff": len(source_only) - before,
        }
        payload_columns = [column["name"] for column in shape.columns if not column["generated"]]
        intended_ids = [item[0] for item in sorted(source_only)]
        intended_rows = fetch_source_rows("public", table, payload_columns, shape.pk_columns[0], intended_ids, shape.pk_columns)
        if {key(row, pk) for row in intended_rows} != source_only:
            raise ApplySafetyError("BOUNDED_AUDIT_INTENDED_SET_CHANGED")
        intended_map = {key(row, pk): row for row in intended_rows}
        blockers, blocked_rows, blocked_references, dependency_fingerprint = blocker_summary(
            source_only, intended_map, shape.foreign_keys, target_parent_keys
        )
        blocker_count = sum(blockers.values())
        bounded_snapshot = {
            "mode": "IMMUTABLE_INTENDED_SET",
            "audit_boundary": None,
            "source_total_at_audit": len(source_keys),
            "intended_count": len(source_only),
            "source_set_fingerprint": fingerprint_keys(source_keys),
            "intended_pk_fingerprint": fingerprint_keys(source_only),
            "intended_payload_fingerprint": fingerprint_rows(intended_rows, pk),
            "intended_dependency_fingerprint": dependency_fingerprint,
            "private_set_path": None,
        }
        bounded_snapshot_private = {
            "table": table,
            "pk_columns": pk,
            "source_keys_at_audit": [list(item) for item in sorted(source_keys)],
            "intended_keys": [list(item) for item in sorted(source_only)],
        }

    auth = None
    if table == "profiles" and source_only:
        ids = ",".join("'" + item[0].replace("'", "''") + "'::uuid" for item in sorted(source_only))
        source_users = int(run_source_sql(f"select count(*)::bigint as n from auth.users where id in ({ids})")["rows"][0]["n"])
        source_identities = int(run_source_sql(f"select count(*)::bigint as n from auth.identities where user_id in ({ids})")["rows"][0]["n"])
        target_users = int(run_target_sql(f"select count(*) from auth.users where id in ({ids});", query_label="auth_dependency_count:users").strip())
        target_identities = int(run_target_sql(f"select count(*) from auth.identities where user_id in ({ids});", query_label="auth_dependency_count:identities").strip())
        auth = {"source_users": source_users, "target_users": target_users, "source_identities": source_identities, "target_identities": target_identities}

    blocker_count = sum(blockers.values())
    findings = schema_findings(meta, shape)
    if table == "live_sessions" and "rtmp_stream_configs" not in {fk["parent_table"] for fk in shape.foreign_keys}:
        findings.append("Expected live_sessions -> rtmp_stream_configs FK was not found.")
    return {
        "table": table,
        "source_count": len(source_keys),
        "target_count": len(target_keys),
        "pk_columns": pk,
        "pk_types": shape.pk_types,
        "source_only_count": len(source_only),
        "target_only_count": len(target_only),
        "common_count": len(common),
        "source_pk_fingerprint": fingerprint_keys(source_keys),
        "target_pk_fingerprint": fingerprint_keys(target_keys),
        "source_only_pk_fingerprint": fingerprint_keys(source_only),
        "common_different_count": None,
        "dependency_blockers": blockers,
        "dependency_blocker_count": blocker_count,
        "blocked_rows": blocked_rows,
        "blocked_fk_references": blocked_references,
        "dependency_fingerprint": dependency_fingerprint,
        "generated_columns": shape.generated_columns,
        "trigger_pre_state": shape.triggers,
        "trigger_count": len(shape.triggers),
        "policy": POLICIES.get(table, meta["policy"]),
        "runtime_transform": ({"null_fields": list(LIVE_SESSION_NULL_FIELDS), "false_fields": list(LIVE_SESSION_FALSE_FIELDS)} if table == "live_sessions" else None),
        "historical_gap": historical,
        "bounded_snapshot": bounded_snapshot,
        "_bounded_snapshot_private": bounded_snapshot_private,
        "auth_dependencies": auth,
        "schema_findings": findings,
        "recommended_next_action": "Resolve blockers and review a generated plan before any apply." if (blocker_count or findings) else "Generate and review a table-specific apply plan.",
        "apply_allowed": False,
    }


def report_markdown(audit: dict[str, Any]) -> str:
    lines = ["# FUN Profile post-copy reconciliation — DRY-RUN", "", f"- Thời điểm UTC: `{audit['created_at']}`", f"- Source write: `{audit['source_write_occurred']}`", f"- Target write: `{audit['target_write_occurred']}`", f"- Trạng thái: `{audit['status']}`", ""]
    if audit.get("error"):
        lines += ["## Blocker", "", audit["error"], ""]
    for row in audit.get("tables", []):
        lines += [f"## {row['table']}", "", f"- Counts source/target/common: `{row['source_count']} / {row['target_count']} / {row['common_count']}`", f"- Source-only / target-only: `{row['source_only_count']} / {row['target_only_count']}`", f"- PK: `{', '.join(row['pk_columns'])}` (`{', '.join(row['pk_types'])}`)", f"- Policy: `{row['policy']}`", f"- Generated columns: `{', '.join(row['generated_columns']) or 'none'}`", f"- Trigger state: `{', '.join(row['trigger_pre_state']) or 'none'}`", f"- Dependency blockers: `{row['dependency_blocker_count']}`", f"- APPLY allowed: `{row['apply_allowed']}`"]
        if row.get("historical_gap"):
            gap = row["historical_gap"]
            lines += [f"- Historical gap <= cutoff / > cutoff: `{gap['source_only_at_or_before_cutoff']} / {gap['source_only_after_cutoff']}`"]
        if row.get("auth_dependencies"):
            lines += [f"- Auth dependencies (source users/target users/source identities/target identities): `{row['auth_dependencies']['source_users']} / {row['auth_dependencies']['target_users']} / {row['auth_dependencies']['source_identities']} / {row['auth_dependencies']['target_identities']}`"]
        if row["schema_findings"]:
            lines += ["- Findings: " + "; ".join(row["schema_findings"])]
        lines.append("")
    return "\n".join(lines)


def save_reports(audit: dict[str, Any]) -> tuple[Path, Path]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for row in audit.get("tables", []):
        private = row.pop("_bounded_snapshot_private", None)
        bounded = row.get("bounded_snapshot")
        if private is None or bounded is None:
            continue
        private.update({"audit_id": audit["audit_id"], "audit_boundary": audit["created_at"]})
        private_path = OUTPUT_DIR / f"{stamp}-{row['table']}-bounded-set.json"
        private_path.write_text(json.dumps(private, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        os.chmod(private_path, 0o600)
        bounded["audit_boundary"] = audit["created_at"]
        bounded["private_set_path"] = str(private_path.relative_to(ROOT))
    json_path = OUTPUT_DIR / f"{stamp}-audit.json"
    md_path = OUTPUT_DIR / f"{stamp}-report.md"
    json_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(report_markdown(audit) + "\n", encoding="utf-8")
    os.chmod(json_path, 0o600)
    os.chmod(md_path, 0o600)
    return json_path, md_path


def relation_metadata(schema: str, table: str) -> dict[str, Any]:
    relation_literal = "'" + (schema + "." + table).replace("'", "''") + "'"
    sql = f"""
select jsonb_build_object(
 'columns', (select jsonb_agg(jsonb_build_object('name',a.attname,'type',t.typname,'generated',a.attgenerated) order by a.attnum) from pg_attribute a join pg_type t on t.oid=a.atttypid where a.attrelid={relation_literal}::regclass and a.attnum>0 and not a.attisdropped),
 'pk', (select jsonb_agg(a.attname order by u.ord) from pg_constraint c cross join lateral unnest(c.conkey) with ordinality u(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum where c.conrelid={relation_literal}::regclass and c.contype='p'),
 'triggers', (select coalesce(jsonb_agg(tgname||':'||tgenabled::text order by tgname),'[]') from pg_trigger where tgrelid={relation_literal}::regclass and not tgisinternal)
)::text;
"""
    return json.loads(run_target_sql(sql, query_label=f"relation_metadata:{schema}.{table}").strip())


def fetch_source_rows(schema: str, table: str, columns: Sequence[str], filter_column: str, values: Sequence[str], pk_columns: Sequence[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    qcolumns = ", ".join(quote_ident(column) for column in columns)
    qpk = ", ".join(quote_ident(column) for column in pk_columns)
    for start in range(0, len(values), 400):
        batch = values[start:start + 400]
        literals = ",".join("'" + value.replace("'", "''") + "'::uuid" for value in batch)
        sql = f"select {qcolumns} from {quote_ident(schema)}.{quote_ident(table)} where {quote_ident(filter_column)} in ({literals}) order by {qpk} limit 1000"
        rows = run_source_sql(sql).get("rows", [])
        if len(rows) >= 1000:
            raise ApplySafetyError("Source batch reached Lane A limit; reduce batch before apply.")
        result.extend(rows)
    return result


def fetch_target_rows_by_ids(schema: str, table: str, columns: Sequence[str], filter_column: str, values: Sequence[str], pk_columns: Sequence[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    qcolumns = ", ".join(quote_ident(column) for column in columns)
    qpk = ", ".join(quote_ident(column) for column in pk_columns)
    for start in range(0, len(values), 400):
        batch = values[start:start + 400]
        literals = ",".join("'" + value.replace("'", "''") + "'::uuid" for value in batch)
        sql = f"select coalesce(jsonb_agg(to_jsonb(q) order by {qpk}),'[]')::text from (select {qcolumns} from {quote_ident(schema)}.{quote_ident(table)} where {quote_ident(filter_column)} in ({literals})) q;"
        result.extend(json.loads(run_target_sql(sql, query_label=f"bounded_target_rows:{schema}.{table}").strip()))
    return result


def load_bounded_private(audit: dict[str, Any], saved: dict[str, Any]) -> dict[str, Any]:
    relative = (saved.get("bounded_snapshot") or {}).get("private_set_path")
    if not relative:
        raise ApplySafetyError("BOUNDED_SNAPSHOT_REQUIRED")
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(OUTPUT_DIR.resolve()) or not path.is_file():
        raise ApplySafetyError("BOUNDED_SNAPSHOT_PRIVATE_SET_INVALID")
    private = json.loads(path.read_text(encoding="utf-8"))
    if private.get("audit_id") != audit.get("audit_id") or private.get("table") != "posts":
        raise ApplySafetyError("BOUNDED_SNAPSHOT_PRIVATE_SET_MISMATCH")
    return private


def bounded_posts_freshness(audit: dict[str, Any], saved: dict[str, Any], *, full_source_scan: bool) -> tuple[dict[str, Any], list[tuple[str, str, list[dict[str, Any]], dict[str, Any], bool]]]:
    private = load_bounded_private(audit, saved)
    intended_ids = [str(item[0]) for item in private.get("intended_keys", [])]
    shape = target_shape("posts")
    if shape.pk_columns != saved.get("pk_columns") or shape.generated_columns != saved.get("generated_columns"):
        raise ApplySafetyError("BOUNDED_SCHEMA_CHANGED")
    columns = [column["name"] for column in shape.columns if not column["generated"]]
    intended_rows = fetch_source_rows("public", "posts", columns, shape.pk_columns[0], intended_ids, shape.pk_columns)
    target_rows = fetch_target_rows_by_ids("public", "posts", shape.pk_columns, shape.pk_columns[0], intended_ids, shape.pk_columns)
    source_map = {key(row, shape.pk_columns): row for row in intended_rows}
    intended_keys = {tuple(str(value) for value in item) for item in private.get("intended_keys", [])}
    if set(source_map) != intended_keys:
        raise ApplySafetyError("BOUNDED_INTENDED_ROW_MISSING")
    blockers, _, _, dependency_fingerprint = blocker_summary(intended_keys, source_map, shape.foreign_keys, target_parent_keys)
    current_source_keys = (
        {key(row, shape.pk_columns) for row in source_scan("posts", shape.pk_columns, shape.pk_columns, shape.pk_types)}
        if full_source_scan else set()
    )
    metrics = validate_bounded_snapshot(
        saved,
        private,
        current_source_keys,
        intended_rows,
        {key(row, shape.pk_columns) for row in target_rows},
        dependency_fingerprint,
        sum(blockers.values()),
        enforce_source_set=full_source_scan,
    )
    metadata = {"columns": shape.columns, "pk": shape.pk_columns, "triggers": shape.triggers}
    payloads = [("public", "posts", intended_rows, metadata, True)]
    return metrics, payloads


def postgres_array_literal(value: list[Any]) -> str:
    def encode(item: Any) -> str:
        if item is None:
            return "NULL"
        if isinstance(item, list):
            return "{" + ",".join(encode(child) for child in item) + "}"
        text = ("true" if item is True else "false" if item is False else str(item)).replace("\\", "\\\\").replace('"', '\\"')
        return f'"{text}"'
    return "{" + ",".join(encode(item) for item in value) + "}"


COPY_NULL = "__FUN_RECONCILE_NULL_7B6F36A5__"


def copy_csv(rows: Sequence[dict[str, Any]], columns: Sequence[dict[str, Any]]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    for row in rows:
        output = []
        for column in columns:
            value = row.get(column["name"])
            if value is None:
                output.append(COPY_NULL)
            elif isinstance(value, list) and column["type"].startswith("_"):
                output.append(postgres_array_literal(value))
            elif column["type"] in {"json", "jsonb"}:
                output.append(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
            elif isinstance(value, bool):
                output.append("true" if value else "false")
            else:
                text = str(value)
                if text == COPY_NULL:
                    raise ApplySafetyError("Row contains reserved COPY null marker.")
                output.append(text)
        writer.writerow(output)
    return stream.getvalue()


def expected_trigger_values(states: Sequence[str]) -> str:
    if not states:
        return "select null::text as name, null::text as state where false"
    values = []
    for item in states:
        name, state = item.rsplit(":", 1)
        values.append("(" + "'" + name.replace("'", "''") + "','" + state + "')")
    return "values " + ",".join(values)


def trigger_assertion_sql(schema: str, table: str, states: Sequence[str]) -> str:
    expected = expected_trigger_values(states)
    return f"""
DO $guard$
BEGIN
 IF EXISTS (({expected}) EXCEPT SELECT tgname::text,tgenabled::text FROM pg_trigger WHERE tgrelid='{schema}.{table}'::regclass AND NOT tgisinternal)
 OR EXISTS (SELECT tgname::text,tgenabled::text FROM pg_trigger WHERE tgrelid='{schema}.{table}'::regclass AND NOT tgisinternal EXCEPT ({expected})) THEN
   RAISE EXCEPTION 'trigger state mismatch';
 END IF;
END $guard$;
"""


def relation_stage_sql(schema: str, table: str, rows: Sequence[dict[str, Any]], metadata: dict[str, Any], temp_name: str, *, manage_triggers: bool) -> str:
    generated = {column["name"] for column in metadata["columns"] if column["generated"]}
    columns = [column for column in metadata["columns"] if column["name"] not in generated]
    names = [column["name"] for column in columns]
    pk = metadata["pk"]
    qnames = ",".join(quote_ident(name) for name in names)
    join = " and ".join(f't.{quote_ident(name)}=s.{quote_ident(name)}' for name in pk)
    trigger_before = metadata["triggers"]
    pieces = [f'LOCK TABLE {quote_ident(schema)}.{quote_ident(table)} IN SHARE ROW EXCLUSIVE MODE;', f'CREATE TEMP TABLE {quote_ident(temp_name)} AS SELECT {qnames} FROM {quote_ident(schema)}.{quote_ident(table)} WITH NO DATA;', f"\\copy {quote_ident(temp_name)} ({qnames}) FROM STDIN WITH (FORMAT csv, NULL '{COPY_NULL}')", copy_csv(rows, columns) + "\\.\n"]
    pieces.append(f"DO $guard$ BEGIN IF (SELECT count(*) FROM {quote_ident(temp_name)}) <> {len(rows)} THEN RAISE EXCEPTION 'staging count mismatch'; END IF; IF EXISTS (SELECT 1 FROM {quote_ident(temp_name)} s JOIN {quote_ident(schema)}.{quote_ident(table)} t ON {join}) THEN RAISE EXCEPTION 'target row appeared after freshness gate'; END IF; END $guard$;")
    if manage_triggers:
        pieces.append(trigger_assertion_sql(schema, table, trigger_before))
        pieces.extend(f'ALTER TABLE {quote_ident(schema)}.{quote_ident(table)} DISABLE TRIGGER {quote_ident(item.rsplit(":",1)[0])};' for item in trigger_before)
    pieces.append(f'INSERT INTO {quote_ident(schema)}.{quote_ident(table)} ({qnames}) SELECT {qnames} FROM {quote_ident(temp_name)};')
    if manage_triggers:
        pieces.extend(statement.replace("public.", f'{quote_ident(schema)}.') for statement in restore_trigger_statements(table, trigger_before))
        pieces.append(trigger_assertion_sql(schema, table, trigger_before))
    target_projection = f'(select {qnames} from {quote_ident(schema)}.{quote_ident(table)})'
    pieces.append(f"DO $guard$ BEGIN IF (SELECT count(*) FROM {quote_ident(temp_name)} s JOIN {target_projection} t ON {join} WHERE to_jsonb(t)=to_jsonb(s)) <> {len(rows)} THEN RAISE EXCEPTION 'exact verification mismatch'; END IF; END $guard$;")
    return "\n".join(pieces)


def table_from_audit(audit: dict[str, Any], table: str) -> dict[str, Any]:
    for row in audit.get("tables", []):
        if row.get("table") == table:
            return row
    raise ApplySafetyError(f"STALE_AUDIT_REAUDIT_REQUIRED: audit lacks {table}")


FRESH_FIELDS = ("source_count", "target_count", "source_only_count", "target_only_count", "source_pk_fingerprint", "target_pk_fingerprint", "source_only_pk_fingerprint", "dependency_fingerprint")


def assert_fresh_audit(audit_status: Any, saved: dict[str, Any], current: dict[str, Any]) -> None:
    if audit_status != "PASS_DRY_RUN":
        raise ApplySafetyError("STALE_AUDIT_REAUDIT_REQUIRED: audit is not PASS_DRY_RUN")
    for field in FRESH_FIELDS:
        if field not in saved or saved[field] is None or saved[field] != current.get(field):
            raise ApplySafetyError(f"STALE_AUDIT_REAUDIT_REQUIRED: changed {field}")


def require_apply_confirmation(stage: str, confirm_write: bool) -> None:
    if stage not in APPLY_STAGES:
        raise ApplySafetyError("INVALID_APPLY_STAGE")
    if not confirm_write:
        raise ApplySafetyError("CONFIRM_WRITE_REQUIRED")


def require_rehearsal_confirmation(stage: str, confirm_rehearsal: bool) -> None:
    if stage not in APPLY_STAGES:
        raise ApplySafetyError("INVALID_REHEARSAL_STAGE")
    if not confirm_rehearsal:
        raise ApplySafetyError("CONFIRM_REHEARSAL_REQUIRED")


def validate_stage_blockers(stage: str, current: dict[str, Any]) -> None:
    allowed = current.get("dependency_blockers", {}).get("profiles_id_fkey", 0) if stage == "auth-deps" else 0
    if current.get("blocked_fk_references", 0) - allowed:
        raise ApplySafetyError("PARENT_DEPENDENCY_BLOCKED")
    if stage == "profiles" and current.get("dependency_blocker_count", 0):
        raise ApplySafetyError("PROFILE_DEPENDENCY_BLOCKED")


def verify_auth_payload(profile_ids: Sequence[str], users: Sequence[dict[str, Any]], identities: Sequence[dict[str, Any]]) -> None:
    wanted = set(profile_ids)
    if {str(row["id"]) for row in users} != wanted:
        raise ApplySafetyError("AUTH_DEPENDENCY_EXACTNESS_FAILED")
    if any(str(row["user_id"]) not in wanted for row in identities):
        raise ApplySafetyError("AUTH_DEPENDENCY_EXACTNESS_FAILED")


def transformed_expected_rows(stage: str, rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    return [transform_live_session(row) for row in rows] if stage == "live_sessions" else [dict(row) for row in rows]


def require_previous_stage(stage: str, audit_created_at: str) -> None:
    previous = PREVIOUS_STAGE.get(stage)
    if not previous:
        return
    for path in OUTPUT_DIR.glob("*-apply.json"):
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
            if report.get("stage") == previous and report.get("transaction_committed") is True and report.get("completed_at", "") < audit_created_at:
                return
        except Exception:
            continue
    raise ApplySafetyError(f"STALE_AUDIT_REAUDIT_REQUIRED: no committed {previous} stage followed by fresh audit")


def save_apply_report(report: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUTPUT_DIR / f"{stamp}-{report['stage']}-apply.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    return path


def save_rehearsal_report(report: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUTPUT_DIR / f"{stamp}-{report['stage']}-rehearsal.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    return path


def source_only_ids(table: str) -> tuple[list[str], dict[str, Any]]:
    manifest = load_manifest()[table]
    shape = target_shape(table)
    current = audit_table(table, manifest)
    source = source_scan(table, shape.pk_columns, shape.pk_columns, shape.pk_types)
    target = target_scan(table, shape.pk_columns, shape.pk_columns)
    source_keys = {key(row, shape.pk_columns) for row in source}
    target_keys = {key(row, shape.pk_columns) for row in target}
    if len(shape.pk_columns) != 1:
        raise ApplySafetyError("Staged apply currently requires a single-column PK.")
    return [item[0] for item in sorted(source_keys - target_keys)], current


def build_stage_payload(stage: str, ids: Sequence[str]) -> tuple[list[tuple[str, str, list[dict[str, Any]], dict[str, Any], bool]], dict[str, Any]]:
    if stage == "auth-deps":
        users_meta = relation_metadata("auth", "users")
        identities_meta = relation_metadata("auth", "identities")
        if users_meta["triggers"] or identities_meta["triggers"]:
            raise ApplySafetyError("AUTH_TRIGGER_PREFLIGHT_FAILED")
        users_cols = [c["name"] for c in users_meta["columns"] if c["name"] != "confirmed_at"]
        identities_cols = [c["name"] for c in identities_meta["columns"] if c["name"] != "email"]
        users_meta["columns"] = [c for c in users_meta["columns"] if c["name"] in users_cols]
        identities_meta["columns"] = [c for c in identities_meta["columns"] if c["name"] in identities_cols]
        users = fetch_source_rows("auth", "users", users_cols, "id", ids, users_meta["pk"])
        identities = fetch_source_rows("auth", "identities", identities_cols, "user_id", ids, identities_meta["pk"])
        verify_auth_payload(ids, users, identities)
        return [("auth", "users", users, users_meta, False), ("auth", "identities", identities, identities_meta, False)], {"intended_users": len(users), "intended_identities": len(identities)}
    table = STAGE_TABLE[stage]
    metadata = relation_metadata("public", table)
    generated = {c["name"] for c in metadata["columns"] if c["generated"]}
    columns = [c["name"] for c in metadata["columns"] if c["name"] not in generated]
    rows = fetch_source_rows("public", table, columns, metadata["pk"][0], ids, metadata["pk"])
    if len(rows) != len(ids):
        raise ApplySafetyError("SOURCE_CHANGED_DURING_PAYLOAD_FETCH")
    rows = transformed_expected_rows(stage, rows)
    return [("public", table, rows, metadata, True)], {"intended_rows": len(rows)}


def build_transaction_script(stage: str, payloads: Sequence[tuple[str, str, list[dict[str, Any]], dict[str, Any], bool]], *, mode: str) -> str:
    if mode not in TRANSACTION_MODES:
        raise ApplySafetyError("INVALID_TRANSACTION_MODE")
    scripts = ["BEGIN;", "SET LOCAL statement_timeout=0;"]
    for index, (schema, relation, rows, metadata, triggers) in enumerate(payloads):
        scripts.append(relation_stage_sql(schema, relation, rows, metadata, f"reconcile_stage_{index}", manage_triggers=triggers))
    if stage == "auth-deps":
        scripts.append("DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM auth.identities i JOIN reconcile_stage_0 u ON u.id=i.user_id LEFT JOIN reconcile_stage_1 s ON s.id=i.id WHERE s.id IS NULL) THEN RAISE EXCEPTION 'unexpected identity for intended user'; END IF; END $guard$;")
        scripts.append("DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM auth.identities i LEFT JOIN auth.users u ON u.id=i.user_id WHERE u.id IS NULL) THEN RAISE EXCEPTION 'orphan identity'; END IF; END $guard$;")
    if mode == "apply":
        scripts.extend(["COMMIT;", "SELECT 'APPLY_TRANSACTION_COMMITTED';"])
    else:
        scripts.extend(["ROLLBACK;", "SELECT 'REHEARSAL_FORCED_ROLLBACK';"])
    return "\n".join(scripts)


def relation_pk_state(schema: str, table: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = metadata or relation_metadata(schema, table)
    rows = target_scan(table, metadata["pk"], metadata["pk"], schema=schema)
    keys = {key(row, metadata["pk"]) for row in rows}
    return {"count": len(keys), "pk_fingerprint": fingerprint_keys(keys), "trigger_states": metadata["triggers"]}


def target_state_for_stage(stage: str) -> dict[str, Any]:
    relations = AUTH_RELATION_ORDER if stage == "auth-deps" else (("public", STAGE_TABLE[stage]),)
    state = {}
    for schema, table in relations:
        state[f"{schema}.{table}"] = relation_pk_state(schema, table)
    return state


def rollback_invariant(before: dict[str, Any], after: dict[str, Any]) -> None:
    if before != after:
        raise ApplySafetyError("REHEARSAL_ROLLBACK_INVARIANT_FAILED")


def command_apply(stage: str, audit_path: Path, confirm_write: bool) -> int:
    report: dict[str, Any] = {"stage": stage, "audit_id": None, "started_at": utc_now(), "preflight": "FAIL", "JWT_TTL_SECONDS": None, "intended_row_count": 0, "inserted_row_count": 0, "exact_match_count": 0, "mismatch_count": 0, "blocked_rows": 0, "blocked_fk_references": 0, "trigger_state_before": [], "trigger_state_after": [], "transaction_committed": False, "transaction_rolled_back": False, "source_write_occurred": False, "target_write_occurred": False}
    try:
        report["JWT_TTL_SECONDS"] = require_fresh_jwt()
        require_apply_confirmation(stage, confirm_write)
        if not audit_path.is_file():
            raise ApplySafetyError("STALE_AUDIT_REAUDIT_REQUIRED: audit file missing")
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        report["audit_id"] = audit.get("audit_id")
        if audit.get("status") != "PASS_DRY_RUN" or not report["audit_id"]:
            raise ApplySafetyError("STALE_AUDIT_REAUDIT_REQUIRED: audit is not a fingerprinted PASS_DRY_RUN")
        require_previous_stage(stage, audit["created_at"])
        table = STAGE_TABLE[stage]
        saved = table_from_audit(audit, table)
        if stage == "posts" and saved.get("bounded_snapshot"):
            raise ApplySafetyError("BOUNDED_POSTS_APPLY_DISABLED_PENDING_SEPARATE_APPROVAL")
        ids, current = source_only_ids(table)
        assert_fresh_audit(audit.get("status"), saved, current)
        report.update({"intended_row_count": len(ids), "blocked_rows": current["blocked_rows"], "blocked_fk_references": current["blocked_fk_references"], "trigger_state_before": current["trigger_pre_state"]})
        validate_stage_blockers(stage, current)
        payloads, counts = build_stage_payload(stage, ids)
        report.update(counts)
        total_rows = sum(len(rows) for _, _, rows, _, _ in payloads)
        report["intended_row_count"] = total_rows
        stage_trigger_state = [
            f"{schema}.{relation}:{state}"
            for schema, relation, _, metadata, _ in payloads
            for state in metadata["triggers"]
        ]
        report["trigger_state_before"] = stage_trigger_state
        _, final_state = source_only_ids(table)
        assert_fresh_audit(audit.get("status"), current, final_state)
        script = build_transaction_script(stage, payloads, mode="apply")
        report["preflight"] = "PASS"
        output = run_target_transaction(script, query_label=f"apply_stage:{stage}")
        if "APPLY_TRANSACTION_COMMITTED" not in output:
            raise ApplySafetyError("COMMIT_MARKER_MISSING")
        report.update({"inserted_row_count": total_rows, "exact_match_count": total_rows, "trigger_state_after": stage_trigger_state, "transaction_committed": True, "target_write_occurred": True})
        report["completed_at"] = utc_now()
        save_apply_report(report)
        print(json.dumps({"status": "APPLY_COMMITTED", "stage": stage, "inserted": total_rows}, ensure_ascii=False))
        return 0
    except Exception as exc:
        report["transaction_rolled_back"] = report["preflight"] == "PASS"
        report["error"] = safe_error(exc)
        report["completed_at"] = utc_now()
        path = save_apply_report(report)
        print(json.dumps({"status": "BLOCKED_SAFE", "stage": stage, "error": report["error"], "report": str(path.relative_to(ROOT))}, ensure_ascii=False))
        return 2


def command_rehearse(stage: str, audit_path: Path, confirm_rehearsal: bool) -> int:
    report: dict[str, Any] = {
        "stage": stage,
        "audit_id": None,
        "strategy": "A_PRECEDING_STAGE_MUST_ALREADY_BE_COMMITTED",
        "started_at": utc_now(),
        "freshness_gate": "FAIL",
        "intended_rows": 0,
        "staged_rows": 0,
        "inserted_inside_transaction_rows": 0,
        "exact_matches_before_rollback": 0,
        "mismatch_count": 0,
        "trigger_state_before": [],
        "trigger_state_transaction": "NOT_STARTED",
        "trigger_state_after_rollback": [],
        "forced_rollback_executed": False,
        "target_count_before": {},
        "target_count_after": {},
        "target_fingerprint_before": {},
        "target_fingerprint_after": {},
        "rollback_invariant": "NOT_CHECKED",
        "source_write_occurred": False,
        "target_persistent_write_occurred": False,
        "transaction_mutation_rehearsed": False,
        "JWT_TTL_SECONDS": None,
        "bounded_intended_count": None,
        "source_total_at_audit": None,
        "source_total_at_freshness": None,
        "additive_rows_outside_intended": None,
        "intended_pk_fingerprint_match": False,
        "intended_payload_fingerprint_match": False,
        "dependency_fingerprint_match": False,
    }
    before: dict[str, Any] | None = None
    try:
        report["JWT_TTL_SECONDS"] = jwt_ttl_seconds()
        if report["JWT_TTL_SECONDS"] < MIN_JWT_TTL_SECONDS:
            raise AuditError("JWT_REFRESH_REQUIRED")
        require_rehearsal_confirmation(stage, confirm_rehearsal)
        if not audit_path.is_file():
            raise ApplySafetyError("STALE_AUDIT_REAUDIT_REQUIRED: audit file missing")
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        report["audit_id"] = audit.get("audit_id")
        if audit.get("status") != "PASS_DRY_RUN" or audit.get("version") != 2 or not report["audit_id"]:
            raise ApplySafetyError("STALE_AUDIT_REAUDIT_REQUIRED: rehearsal requires fingerprinted v2 PASS_DRY_RUN")
        require_previous_stage(stage, audit["created_at"])
        table = STAGE_TABLE[stage]
        saved = table_from_audit(audit, table)
        if stage == "posts":
            metrics, payloads = bounded_posts_freshness(audit, saved, full_source_scan=True)
            intended_count = len(metrics.pop("intended_keys"))
            report.update(metrics)
            report["bounded_intended_count"] = intended_count
            report["freshness_gate"] = "PASS"
            final_metrics, payloads = bounded_posts_freshness(audit, saved, full_source_scan=False)
            for field in ("intended_pk_fingerprint_match", "intended_payload_fingerprint_match", "dependency_fingerprint_match"):
                if not final_metrics[field]:
                    raise ApplySafetyError("BOUNDED_FINAL_FRESHNESS_FAILED")
        else:
            ids, current = source_only_ids(table)
            assert_fresh_audit(audit.get("status"), saved, current)
            validate_stage_blockers(stage, current)
            report["freshness_gate"] = "PASS"
            payloads, counts = build_stage_payload(stage, ids)
            report.update(counts)
            _, final_state = source_only_ids(table)
            assert_fresh_audit(audit.get("status"), current, final_state)
        total_rows = sum(len(rows) for _, _, rows, _, _ in payloads)
        report.update({"intended_rows": total_rows, "staged_rows": total_rows})
        before = target_state_for_stage(stage)
        report["target_count_before"] = {name: state["count"] for name, state in before.items()}
        report["target_fingerprint_before"] = {name: state["pk_fingerprint"] for name, state in before.items()}
        report["trigger_state_before"] = {name: state["trigger_states"] for name, state in before.items()}
        script = build_transaction_script(stage, payloads, mode="rehearse")
        script_lines = {line.strip().upper() for line in script.splitlines()}
        if "COMMIT;" in script_lines or "ROLLBACK;" not in script_lines:
            raise ApplySafetyError("REHEARSAL_TRANSACTION_TERMINATOR_INVALID")
        output = run_target_transaction(script, query_label=f"rehearse_stage:{stage}")
        if "REHEARSAL_FORCED_ROLLBACK" not in output:
            raise ApplySafetyError("REHEARSAL_ROLLBACK_MARKER_MISSING")
        report.update({"inserted_inside_transaction_rows": total_rows, "exact_matches_before_rollback": total_rows, "trigger_state_transaction": "RESTORED_EXACT_BEFORE_ROLLBACK", "forced_rollback_executed": True, "transaction_mutation_rehearsed": True})
        after = target_state_for_stage(stage)
        report["target_count_after"] = {name: state["count"] for name, state in after.items()}
        report["target_fingerprint_after"] = {name: state["pk_fingerprint"] for name, state in after.items()}
        report["trigger_state_after_rollback"] = {name: state["trigger_states"] for name, state in after.items()}
        rollback_invariant(before, after)
        report["rollback_invariant"] = "PASS"
        report["completed_at"] = utc_now()
        path = save_rehearsal_report(report)
        print(json.dumps({"status": "REHEARSAL_PASS_ROLLED_BACK", "stage": stage, "report": str(path.relative_to(ROOT))}, ensure_ascii=False))
        return 0
    except Exception as exc:
        report["error"] = safe_error(exc)
        if before is not None:
            try:
                after = target_state_for_stage(stage)
                report["target_count_after"] = {name: state["count"] for name, state in after.items()}
                report["target_fingerprint_after"] = {name: state["pk_fingerprint"] for name, state in after.items()}
                report["trigger_state_after_rollback"] = {name: state["trigger_states"] for name, state in after.items()}
                rollback_invariant(before, after)
                report["rollback_invariant"] = "PASS"
            except Exception:
                report["rollback_invariant"] = "FAIL"
                report["error"] = "REHEARSAL_ROLLBACK_INVARIANT_FAILED"
        report["completed_at"] = utc_now()
        path = save_rehearsal_report(report)
        print(json.dumps({"status": "BLOCKED_SAFE", "stage": stage, "error": report["error"], "report": str(path.relative_to(ROOT))}, ensure_ascii=False))
        return 2


def command_audit(tables: Sequence[str]) -> int:
    audit: dict[str, Any] = {"version": 2, "audit_id": str(uuid.uuid4()), "mode": "DRY_RUN_READ_ONLY", "created_at": utc_now(), "status": "RUNNING", "source_write_occurred": False, "target_write_occurred": False, "preflight": {"JWT_TTL_SECONDS": None}, "tables": []}
    try:
        audit["preflight"]["environment"] = {name: bool(os.environ.get(name)) for name in ("FUN_JWT", "FUN_SOURCE_ANON_KEY", "TARGET", "PGPASSFILE")}
        audit["preflight"]["JWT_TTL_SECONDS"] = jwt_ttl_seconds()
        if audit["preflight"]["JWT_TTL_SECONDS"] < MIN_JWT_TTL_SECONDS:
            raise AuditError("JWT_REFRESH_REQUIRED")
        source_probe = run_source_sql("select 1::int as ok")
        audit["preflight"]["source_read_only_probe"] = source_probe.get("rows") == [{"ok": 1}]
        audit["preflight"]["source_helper_default_mode"] = "read"
        audit["preflight"]["target_probe"] = run_target_sql("select 1;", query_label="target_preflight_probe").strip() == "1"
        manifest = load_manifest()
        for table in tables:
            if table not in AUDIT_TABLES:
                raise AuditError(f"Table is outside this audited scope: {table}")
            audit["tables"].append(audit_table(table, manifest[table]))
        audit["status"] = "PASS_DRY_RUN"
    except Exception as exc:  # report a sanitized blocker without leaking subprocess output
        audit["status"] = "BLOCKED_SAFE"
        audit["error"] = safe_error(exc)
    paths = save_reports(audit)
    print(json.dumps({"status": audit["status"], "reports": [str(p.relative_to(ROOT)) for p in paths], "source_write_occurred": False, "target_write_occurred": False}, ensure_ascii=False))
    return 0 if audit["status"] == "PASS_DRY_RUN" else 2


def main() -> int:
    parser = argparse.ArgumentParser(description="FUN Profile post-copy reconciliation (dry-run by default)")
    sub = parser.add_subparsers(dest="command")
    audit_parser = sub.add_parser("audit", help="Read-only full PK set-diff")
    audit_parser.add_argument("--table", choices=AUDIT_TABLES)
    apply_parser = sub.add_parser("apply", help="Explicit, staged and fingerprint-gated target writer")
    apply_parser.add_argument("--stage", required=True, choices=APPLY_STAGES)
    apply_parser.add_argument("--audit", type=Path, required=True)
    apply_parser.add_argument("--confirm-write", action="store_true")
    rehearsal_parser = sub.add_parser("rehearse", help="Exercise staged writer and force an explicit rollback")
    rehearsal_parser.add_argument("--stage", required=True, choices=APPLY_STAGES)
    rehearsal_parser.add_argument("--audit", type=Path, required=True)
    rehearsal_parser.add_argument("--confirm-rehearsal", action="store_true")
    verify_parser = sub.add_parser("verify", help="Run the same exact read-only audit for one table")
    verify_parser.add_argument("--table", required=True, choices=AUDIT_TABLES)
    args = parser.parse_args()

    if args.command in (None, "audit"):
        table = getattr(args, "table", None)
        return command_audit((table,) if table else AUDIT_TABLES)
    if args.command == "verify":
        return command_audit((args.table,))
    if args.command == "apply":
        return command_apply(args.stage, args.audit, args.confirm_write)
    if args.command == "rehearse":
        return command_rehearse(args.stage, args.audit, args.confirm_rehearsal)
    raise SystemExit("REFUSED: unsupported command")


if __name__ == "__main__":
    raise SystemExit(main())
