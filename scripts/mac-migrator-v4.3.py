#!/usr/bin/env python3

import argparse
import csv
import hashlib
import heapq
import shutil
from decimal import Decimal, InvalidOperation
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

MANIFEST_FILE = ROOT / "migration-snapshot/28-migration-manifest.json"
COLUMNS_FILE = ROOT / "migration-snapshot/04a-table-columns.json"

STATE_DIR = ROOT / "migration-state"
WORK_DIR = STATE_DIR / ".work"
LOG_DIR = ROOT / "migration-logs"
TEMP_DIR = ROOT / "migration-temp"

for d in (STATE_DIR, WORK_DIR, LOG_DIR, TEMP_DIR):
    d.mkdir(parents=True, exist_ok=True)


APPLY_ALLOWLIST = {
    "external_wallet_labels",
    "btc_history_repair_audit_20260612",
    "btc_resolver_shadow_log",
    "email_delivery_logs",

    # Security-sensitive table explicitly reviewed for exact-copy path.
    "user_roles",

    # Mutable table explicitly reviewed for single-statement snapshot.
    "pplp_device_registry",

    # Cycle-safe special migration:
    # two nullable cycle FK columns are neutralized during initial copy
    # and backfilled after posts/live_sessions are migrated.
    "profiles",    "posts",    "live_replays",    "messages",
    "reel_comments",
    "pplp_mint_requests",
    "live_sessions",    "external_tx_filter_log",    "pet_interactions",    "pplp_v25_vvu_log",    "scanner_block_gaps",    "scanner_tick_log",    "transactions",    "identity_epoch_snapshots",    "wallet_reconciliation_findings",    "comments",    "post_attachments",    "donations",    "light_actions",    "reactions",
    "chunked_recording_chunks",
    "notifications",
    "live_session_events",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def log(message):
    line = f"[{now_iso()}] {message}"
    print(line)

    with open(
        LOG_DIR / "mac-migrator-v4.3.log",
        "a",
        encoding="utf-8",
    ) as f:
        f.write(line + "\n")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


MANIFEST_DATA = load_json(MANIFEST_FILE)
MANIFEST = {
    t["table_name"]: t
    for t in MANIFEST_DATA["tables"]
}

COLUMN_ROWS = load_json(COLUMNS_FILE)["rows"]

COLUMN_META = {
    (r["table_name"], r["column_name"]): r
    for r in COLUMN_ROWS
}


def run_source_sql(sql):
    if not os.environ.get("FUN_JWT"):
        raise RuntimeError(
            "FUN_JWT is not set. Refresh source JWT locally."
        )

    proc = subprocess.run(
        ["bash", "scripts/fun-sql.sh", sql],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            proc.stderr.strip()
            or "fun-sql.sh failed"
        )

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Source returned invalid JSON: {e}"
        )

    if result.get("ok") is not True:
        raise RuntimeError(
            f"Source SQL error: "
            f"{result.get('error')} - "
            f"{result.get('message')}"
        )

    return result


def run_target_psql(args=None, input_text=None):
    target = os.environ.get("TARGET")

    if not target:
        raise RuntimeError("TARGET is not set")

    args = args or []

    proc = subprocess.run(
        [
            "psql",
            target,
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            *args,
        ],
        cwd=ROOT,
        text=True,
        input=input_text,
        capture_output=True,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            proc.stderr.strip()
            or proc.stdout.strip()
            or "psql failed"
        )

    return proc.stdout


def sql_literal(value, udt_name):
    if udt_name in ("int2", "int4", "int8"):
        return str(int(value))

    escaped = str(value).replace("'", "''")

    cast_map = {
        "uuid": "uuid",
        "text": "text",
        "date": "date",
        "timestamptz": "timestamptz",
    }

    cast = cast_map.get(udt_name)

    if not cast:
        raise RuntimeError(
            f"Unsupported cursor type: {udt_name}"
        )

    return f"'{escaped}'::{cast}"


def canonical_hash(
    rows,
    pk_columns,
    numeric_columns=None,
):
    numeric_columns = set(numeric_columns or [])

    def normalize_numeric(value):
        if value is None:
            return None

        try:
            d = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return value

        if d == 0:
            return "0"

        return format(d.normalize(), "f")

    def normalize_row(row):
        normalized = dict(row)

        for column in numeric_columns:
            if column in normalized:
                normalized[column] = normalize_numeric(
                    normalized[column]
                )

        return normalized

    normalized_rows = [
        normalize_row(row)
        for row in rows
    ]

    def key(row):
        return tuple(
            str(row[c])
            for c in pk_columns
        )

    ordered = sorted(
        normalized_rows,
        key=key,
    )

    payload = json.dumps(
        ordered,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(payload).hexdigest()



# ============================================================
# LARGE / GIANT streaming verification
#
# These tables must not load the complete source or target
# dataset into Python memory during final hashing.
# ============================================================

LARGE_STREAM_TABLES = {
    "chunked_recording_chunks",
    "notifications",
    "live_session_events",
}

# GIANT tables use:
# - frozen created_at cutoff
# - PK-only pagination
# - no full source count(*) before fetch
# Exact snapshot row count is established after pagination.
GIANT_PK_CUTOFF_TABLES = {
    "live_session_events",
}

LARGE_HASH_SORT_CHUNK_ROWS = 25000
LARGE_TARGET_VERIFY_PAGE_SIZE = 1000


def normalize_numeric_for_hash(value):
    if value is None:
        return None

    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return value

    if d == 0:
        return "0"

    return format(d.normalize(), "f")


def normalize_row_for_hash(row, numeric_columns):
    normalized = dict(row)

    for column in set(numeric_columns or []):
        if column in normalized:
            normalized[column] = normalize_numeric_for_hash(
                normalized[column]
            )

    return normalized


def canonical_row_json(row, numeric_columns):
    normalized = normalize_row_for_hash(
        row,
        numeric_columns,
    )

    return json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def source_jsonl_stream_hash(
    table,
    pk_columns,
    numeric_columns=None,
):
    """
    Exact equivalent of canonical_hash(), but bounded-memory.

    The source JSONL is fetched in snapshot order, which may be
    (created_at, PK), not pure PK order. Therefore rows are
    externally sorted by canonical PK key in bounded chunks,
    then merged while SHA256 is updated incrementally.
    """

    if len(pk_columns) != 1:
        raise RuntimeError(
            f"{table}: LARGE streaming hash currently "
            "requires single-column PK"
        )

    pk = pk_columns[0]

    pk_data_type = COLUMN_META[(table, pk)]["data_type"]

    integer_pk_types = {
        "smallint",
        "integer",
        "bigint",
    }

    def source_pk_sort_key(row):
        value = row[pk]

        if pk_data_type in integer_pk_types:
            return int(value)

        return str(value)

    source_path = temp_rows_path(table)

    if not source_path.exists():
        raise RuntimeError(
            f"{table}: source JSONL missing: {source_path}"
        )

    sort_dir = TEMP_DIR / f".{table}-hash-sort"

    if sort_dir.exists():
        shutil.rmtree(sort_dir)

    sort_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    os.chmod(sort_dir, 0o700)

    chunk_paths = []
    chunk = []
    total_rows = 0

    def flush_chunk():
        nonlocal chunk

        if not chunk:
            return

        chunk.sort(
            key=source_pk_sort_key
        )

        chunk_path = (
            sort_dir
            / f"chunk-{len(chunk_paths):06d}.jsonl"
        )

        with chunk_path.open(
            "w",
            encoding="utf-8",
        ) as f:
            for row in chunk:
                f.write(
                    json.dumps(
                        row,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )

        os.chmod(chunk_path, 0o600)
        chunk_paths.append(chunk_path)

        print(
            "SOURCE HASH SORT CHUNK:",
            len(chunk_paths),
            "/",
            len(chunk),
            "rows",
        )

        chunk = []

    try:
        with source_path.open(
            "r",
            encoding="utf-8",
        ) as f:
            for line in f:
                line = line.strip()

                if not line:
                    continue

                row = json.loads(line)
                row = normalize_row_for_hash(
                    row,
                    numeric_columns,
                )

                chunk.append(row)
                total_rows += 1

                if (
                    len(chunk)
                    >= LARGE_HASH_SORT_CHUNK_ROWS
                ):
                    flush_chunk()

        flush_chunk()

        expected = load_work_state(table).get(
            "expected_snapshot_rows"
        )

        if (
            expected is not None
            and total_rows != int(expected)
        ):
            raise RuntimeError(
                f"{table}: source streaming hash count "
                f"mismatch expected={expected} "
                f"actual={total_rows}"
            )

        def chunk_iter(path):
            with path.open(
                "r",
                encoding="utf-8",
            ) as f:
                for line in f:
                    line = line.strip()

                    if line:
                        yield json.loads(line)

        iterators = [
            chunk_iter(path)
            for path in chunk_paths
        ]

        merged = heapq.merge(
            *iterators,
            key=source_pk_sort_key,
        )

        h = hashlib.sha256()
        h.update(b"[")

        first = True
        hashed_rows = 0

        for row in merged:
            if not first:
                h.update(b",")

            payload = json.dumps(
                row,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")

            h.update(payload)

            first = False
            hashed_rows += 1

        h.update(b"]")

        if hashed_rows != total_rows:
            raise RuntimeError(
                f"{table}: external hash merge count "
                f"mismatch source={total_rows} "
                f"hashed={hashed_rows}"
            )

        print(
            "SOURCE STREAM HASH COMPLETE:",
            hashed_rows,
            "rows",
        )

        return h.hexdigest(), hashed_rows

    finally:
        if sort_dir.exists():
            shutil.rmtree(sort_dir)


def write_csv_from_jsonl_stream(table):
    meta = MANIFEST[table]
    columns = meta["writable_columns"]

    source_path = temp_rows_path(table)
    csv_path = TEMP_DIR / f"{table}-v4.3.csv"

    row_count = 0

    with source_path.open(
        "r",
        encoding="utf-8",
    ) as src, csv_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as dst:

        writer = csv.writer(dst)
        writer.writerow(columns)

        for line in src:
            line = line.strip()

            if not line:
                continue

            record = json.loads(line)
            output = []

            for col in columns:
                value = record.get(col)
                col_meta = COLUMN_META[(table, col)]
                data_type = col_meta["data_type"]

                if value is None:
                    output.append(r"\N")

                elif data_type == "ARRAY":
                    output.append(
                        postgres_array_literal(value)
                    )

                elif isinstance(value, bool):
                    output.append(
                        "true" if value else "false"
                    )

                elif data_type in ("json", "jsonb"):
                    output.append(
                        json.dumps(
                            value,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                    )

                else:
                    output.append(str(value))

            writer.writerow(output)
            row_count += 1

    os.chmod(csv_path, 0o600)

    print(
        "SOURCE STREAM CSV COMPLETE:",
        row_count,
        "rows",
    )

    return csv_path, row_count


def target_stream_hash(
    table,
    pk_columns,
    numeric_columns=None,
):
    """
    Read target in deterministic PK order and update the same
    canonical JSON-array SHA256 without accumulating target rows.
    """

    if len(pk_columns) != 1:
        raise RuntimeError(
            f"{table}: target streaming hash currently "
            "requires single-column PK"
        )

    meta = MANIFEST[table]
    columns = meta["all_columns"]
    pk = pk_columns[0]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    page_size = LARGE_TARGET_VERIFY_PAGE_SIZE
    cursor = None
    page_no = 0
    total_rows = 0

    h = hashlib.sha256()
    h.update(b"[")

    first = True

    while True:
        where_sql = ""

        if cursor is not None:
            escaped = str(cursor).replace(
                "'",
                "''",
            )

            where_sql = (
                f'where "{pk}" > \'{escaped}\''
            )

        sql = f"""
select coalesce(
  json_agg(t order by "{pk}"),
  '[]'::json
)::text
from (
  select {qcols}
  from public."{table}"
  {where_sql}
  order by "{pk}"
  limit {page_size}
) t;
""".strip()

        out = run_target_psql([
            "-At",
            "-c",
            sql,
        ]).strip()

        page = json.loads(out)

        if not page:
            break

        for row in page:
            payload = canonical_row_json(
                row,
                numeric_columns,
            ).encode("utf-8")

            if not first:
                h.update(b",")

            h.update(payload)
            first = False

        page_no += 1
        total_rows += len(page)
        cursor = page[-1][pk]

        print(
            f"TARGET STREAM VERIFY PAGE {page_no}: "
            f"{len(page)} rows / total {total_rows}"
        )

        if len(page) < page_size:
            break

    h.update(b"]")

    print(
        "TARGET STREAM HASH COMPLETE:",
        f"{page_no} pages / {total_rows} rows",
    )

    return h.hexdigest(), total_rows


def target_numeric_columns(table):
    sql = f"""
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = '{table}'
  AND data_type IN ('numeric', 'decimal')
ORDER BY ordinal_position;
""".strip()

    out = run_target_psql([
        "-At",
        "-c",
        sql,
    ])

    return [
        line.strip()
        for line in out.splitlines()
        if line.strip()
    ]


def target_count(table):
    out = run_target_psql([
        "-At",
        "-c",
        f'SELECT count(*) FROM public."{table}";',
    ])

    return int(out.strip())


def trigger_states(table):
    sql = f"""
select
  tgname || ':' || tgenabled::text
from pg_trigger
where tgrelid='public."{table}"'::regclass
  and not tgisinternal
order by tgname;
""".strip()

    out = run_target_psql([
        "-At",
        "-c",
        sql,
    ])

    return [
        x.strip()
        for x in out.splitlines()
        if x.strip()
    ]


def work_state_path(table):
    return WORK_DIR / f"{table}.json"


def temp_rows_path(table):
    return TEMP_DIR / f"{table}-v4.3-rows.jsonl"


def save_work_state(table, state):
    path = work_state_path(table)

    path.write_text(
        json.dumps(
            state,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    os.chmod(path, 0o600)


def load_work_state(table):
    path = work_state_path(table)

    if not path.exists():
        return None

    return load_json(path)


def reset_work_state(table):
    for path in (
        work_state_path(table),
        temp_rows_path(table),
    ):
        if path.exists():
            path.unlink()


def append_rows_jsonl(table, rows):
    path = temp_rows_path(table)

    with open(
        path,
        "a",
        encoding="utf-8",
    ) as f:
        for row in rows:
            f.write(
                json.dumps(
                    row,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )

    os.chmod(path, 0o600)


def load_rows_jsonl(table):
    path = temp_rows_path(table)

    if not path.exists():
        return []

    rows = []

    with open(
        path,
        "r",
        encoding="utf-8",
    ) as f:
        for line in f:
            line = line.strip()

            if line:
                rows.append(json.loads(line))

    return rows


def determine_cutoff_spec(table):
    CREATED_AT_CUTOFF_TABLES = {
        "btc_resolver_shadow_log",
        "friendships",
        "fun_core_proxy_audit",
        "fun_profile_event_outbox",
        "otp_codes",
        "pet_states",
        "pplp_v25_impact_metrics",
        "pplp_v25_light_scores",
        "pplp_v25_tier_assignments",
        "pplp_v2_event_log",
        "search_logs",
        "stale_unaccepted_accounts_log",
        "video_upload_sessions",
        "wallet_scan_metrics",
        "did_registry",

        # Wave 1 audited 2026-09-21
        "conversations",
        "pplp_fraud_signals",
        "search_history",
        "admin_backfill_candidates",
        "identity_events",
        "reward_vesting_schedules",
        "account_activity_logs",
        "light_reputation",
        "login_ip_logs",
        "profile_btc_aux_addresses",
        "quest_user_progress",
        "soul_nfts",
        "wallet_transfers",
        "reel_views",
        "posts",
        "post_tags",
        "shared_posts",
        "live_replays",
        "messages",
        "pplp_mint_requests",
        "mint_allocations",
        "live_sessions",
        "chunked_recordings",
        "creator_library",
        "live_messages",
        "live_reactions",
        "external_tx_filter_log",
        "pet_interactions",
        "pplp_v25_vvu_log",
        "scanner_block_gaps",
        "scanner_tick_log",
        "transactions",
        "identity_epoch_snapshots",
        "wallet_reconciliation_findings",        "comments",
        "post_attachments",
        "donations",
        "light_actions",
        "reactions",
        "chunked_recording_chunks",
        "notifications",
        "live_session_events",

    }

    if table in CREATED_AT_CUTOFF_TABLES:
        return ("created_at", "timestamptz")

    SPECIAL_CUTOFFS = {
        "profiles_wallet_audit": ("changed_at", "timestamptz"),
        "pplp_v25_stability_index": ("snapshot_date", "date"),
        "wallet_reconciliation_runs": ("started_at", "timestamptz"),
        "conversation_participants": ("joined_at", "timestamptz"),
        "video_downloads": ("downloaded_at", "timestamptz"),
        "message_reads": ("read_at", "timestamptz"),
    }

    return SPECIAL_CUTOFFS.get(table)


def determine_cutoff_column(table):
    spec = determine_cutoff_spec(table)
    return spec[0] if spec else None


def create_initial_work_state(table):
    meta = MANIFEST[table]
    cutoff_spec = determine_cutoff_spec(table)
    cutoff_column = cutoff_spec[0] if cutoff_spec else None
    cutoff_type = cutoff_spec[1] if cutoff_spec else None

    state = {
        "table": table,
        "status": "fetching",
        "page_no": 0,
        "rows_fetched": 0,
        "cursor_pk": None,
        "cursor_cutoff_value": None,
        "cutoff_column": cutoff_column,
        "cutoff_type": cutoff_type,
        "cutoff": None,
        "expected_snapshot_rows": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    if cutoff_column:
        if table in GIANT_PK_CUTOFF_TABLES:
            result = run_source_sql("""
select statement_timestamp() as cutoff
""".strip())

            row = result["rows"][0]

            state["cutoff"] = row["cutoff"]
            state["expected_snapshot_rows"] = None

            print(
                "SOURCE SNAPSHOT CUTOFF:",
                state["cutoff"],
            )

            print(
                "GIANT SNAPSHOT ROW COUNT:",
                "DEFERRED UNTIL SOURCE PAGINATION COMPLETES",
            )
        else:
            result = run_source_sql(f"""
select
  statement_timestamp() as cutoff,
  count(*)::bigint as row_count
from public."{table}"
where "{cutoff_column}" <= statement_timestamp()
""".strip())

            row = result["rows"][0]

            state["cutoff"] = row["cutoff"]
            state["expected_snapshot_rows"] = int(row["row_count"])

            print(
                "SOURCE SNAPSHOT CUTOFF:",
                state["cutoff"],
            )

            print(
                "SOURCE SNAPSHOT ROWS:",
                state["expected_snapshot_rows"],
            )

    else:
        if meta["count_type"] != "exact":
            raise RuntimeError(
                f"{table}: exact source count required"
            )

        state["expected_snapshot_rows"] = int(meta["row_count"])

    save_work_state(table, state)

    return state


def fetch_source_resumable(table):
    meta = MANIFEST[table]
    pk_columns = meta["primary_key"]["columns"]

    if len(pk_columns) != 1:
        raise RuntimeError(
            f"{table}: v4.3 currently requires single-column PK"
        )

    pk = pk_columns[0]
    pk_meta = COLUMN_META[(table, pk)]
    pk_udt = pk_meta["udt_name"]

    columns = meta["all_columns"]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    # --------------------------------------------------
    # Security-sensitive single-statement snapshot:
    #
    # These tables have no stable creation cutoff and may
    # change while production is live. Fetch count + rows
    # from ONE PostgreSQL statement snapshot instead of
    # relying on manifest count or multi-statement paging.
    # --------------------------------------------------

    SINGLE_STATEMENT_SNAPSHOT_TABLES = {
        "user_roles",
        "pplp_device_registry",
        "dib_profile",
        "trust_profile",
        "profiles",
        "reel_comments",
    }

    if table in SINGLE_STATEMENT_SNAPSHOT_TABLES:
        sql = f"""
select jsonb_build_object(
  'total', count(*)::bigint,
  'rows',
    coalesce(
      jsonb_agg(to_jsonb(t) order by t."{pk}"),
      '[]'::jsonb
    )
) as "__migration_payload"
from (
  select {qcols}
  from public."{table}"
) t
""".strip()

        result = run_source_sql(sql)
        result_rows = result.get("rows", [])

        if len(result_rows) != 1:
            raise RuntimeError(
                f"{table}: expected exactly one "
                f"single-statement payload row, "
                f"got {len(result_rows)}"
            )

        payload = result_rows[0].get("__migration_payload")

        if isinstance(payload, str):
            payload = json.loads(payload)

        if not isinstance(payload, dict):
            raise RuntimeError(
                f"{table}: invalid single-statement payload"
            )

        live_total = int(payload.get("total", 0))
        clean_rows = payload.get("rows", [])

        if not isinstance(clean_rows, list):
            raise RuntimeError(
                f"{table}: payload rows are not a list"
            )

        if len(clean_rows) != live_total:
            raise RuntimeError(
                f"{table}: security snapshot count mismatch: "
                f"total={live_total}, fetched={len(clean_rows)}"
            )

        print(
            "SOURCE SINGLE-STATEMENT SNAPSHOT:",
            live_total,
            "rows",
        )

        state = {
            "table": table,
            "status": "fetched",
            "page_no": 1,
            "rows_fetched": live_total,
            "cursor_pk": (
                clean_rows[-1][pk]
                if clean_rows else None
            ),
            "cursor_cutoff_value": None,
            "cutoff_column": None,
            "cutoff_type": None,
            "cutoff": None,
            "expected_snapshot_rows": live_total,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }

        reset_work_state(table)
        append_rows_jsonl(table, clean_rows)
        save_work_state(table, state)

        return clean_rows, state

    # --------------------------------------------------
    # Lane A:
    # Small tables are fetched in ONE source statement.
    # count(*) over() gives the live total from the same
    # statement snapshot, so stale manifest counts do not
    # cause false failures.
    # --------------------------------------------------

    if (
        int(meta["row_count"]) <= 1000
        and determine_cutoff_column(table) is None
    ):
        sql = f"""
select
  count(*) over()::bigint as "__migration_total",
  {qcols}
from public."{table}"
order by "{pk}" asc
limit 1000
""".strip()

        result = run_source_sql(sql)
        rows = result.get("rows", [])

        if rows:
            live_total = int(rows[0]["__migration_total"])
        else:
            live_total = 0

        if live_total > 1000:
            raise RuntimeError(
                f"{table}: Lane A grew to {live_total} rows; "
                f"reclassify before migration"
            )

        clean_rows = []

        for row in rows:
            row = dict(row)
            row.pop("__migration_total", None)
            clean_rows.append(row)

        if len(clean_rows) != live_total:
            raise RuntimeError(
                f"{table}: single-statement count mismatch: "
                f"total={live_total}, fetched={len(clean_rows)}"
            )

        print(
            "SOURCE SINGLE-STATEMENT SNAPSHOT:",
            live_total,
            "rows",
        )

        state = {
            "table": table,
            "status": "fetched",
            "page_no": 1,
            "rows_fetched": live_total,
            "cursor_pk": (
                clean_rows[-1][pk]
                if clean_rows else None
            ),
            "cursor_cutoff_value": None,
            "cutoff_column": None,
            "cutoff": None,
            "expected_snapshot_rows": live_total,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }

        reset_work_state(table)
        append_rows_jsonl(table, clean_rows)
        save_work_state(table, state)

        return clean_rows, state

    state = load_work_state(table)

    if state is None:
        state = create_initial_work_state(table)
    else:
        print(
            "RESUMING WORK STATE:",
            work_state_path(table),
        )
        print(
            "RESUME PAGE:",
            state["page_no"],
            "ROWS:",
            state["rows_fetched"],
        )

    if state["status"] == "fetched":
        if table in LARGE_STREAM_TABLES:
            print(
                "LARGE STREAM SOURCE RESUME:",
                state["expected_snapshot_rows"],
                "rows remain on disk"
            )
            return None, state

        rows = load_rows_jsonl(table)

        if len(rows) != state["expected_snapshot_rows"]:
            raise RuntimeError(
                f"{table}: fetched-state JSONL count mismatch"
            )

        return rows, state

    page_size = (
        1000
        if table in GIANT_PK_CUTOFF_TABLES
        else 500
    )

    while True:
        predicates = []

        cutoff_column = state["cutoff_column"]
        cutoff_type = state.get("cutoff_type", "timestamptz")

        if table in GIANT_PK_CUTOFF_TABLES:
            if not cutoff_column:
                raise RuntimeError(
                    f"{table}: GIANT mode requires cutoff column"
                )

            cutoff_literal = sql_literal(
                state["cutoff"],
                cutoff_type,
            )

            predicates.append(
                f'"{cutoff_column}" <= {cutoff_literal}'
            )

            if state["cursor_pk"] is not None:
                cursor_pk = sql_literal(
                    state["cursor_pk"],
                    pk_udt,
                )

                predicates.append(
                    f'"{pk}" > {cursor_pk}'
                )

            order_by = f'"{pk}" asc'

        elif cutoff_column:
            cutoff_literal = sql_literal(
                state["cutoff"],
                cutoff_type,
            )

            predicates.append(
                f'"{cutoff_column}" <= {cutoff_literal}'
            )

            if state["cursor_pk"] is not None:
                cursor_ts = sql_literal(
                    state["cursor_cutoff_value"],
                    cutoff_type,
                )

                cursor_pk = sql_literal(
                    state["cursor_pk"],
                    pk_udt,
                )

                predicates.append(
                    f'("{cutoff_column}", "{pk}") > '
                    f'({cursor_ts}, {cursor_pk})'
                )

            order_by = (
                f'"{cutoff_column}" asc, "{pk}" asc'
            )

        else:
            if state["cursor_pk"] is not None:
                predicates.append(
                    f'"{pk}" > '
                    f'{sql_literal(state["cursor_pk"], pk_udt)}'
                )

            order_by = f'"{pk}" asc'

        where = ""

        if predicates:
            where = (
                "where "
                + " and ".join(predicates)
            )

        sql = f"""
select {qcols}
from public."{table}"
{where}
order by {order_by}
limit {page_size}
""".strip()

        result = run_source_sql(sql)
        rows = result.get("rows", [])

        state["page_no"] += 1

        print(
            f"SOURCE PAGE {state['page_no']}: "
            f"{len(rows)} rows"
        )

        if not rows:
            break

        new_cursor_pk = rows[-1][pk]

        if table in GIANT_PK_CUTOFF_TABLES:
            if (
                state["cursor_pk"] is not None
                and str(new_cursor_pk)
                == str(state["cursor_pk"])
            ):
                raise RuntimeError(
                    f"{table}: GIANT PK cursor did not advance"
                )

            state["cursor_cutoff_value"] = None

        elif cutoff_column:
            new_cursor_cutoff = rows[-1][cutoff_column]

            if (
                state["cursor_pk"] is not None
                and str(new_cursor_pk)
                == str(state["cursor_pk"])
                and str(new_cursor_cutoff)
                == str(state["cursor_cutoff_value"])
            ):
                raise RuntimeError(
                    f"{table}: tuple cursor did not advance"
                )

            state["cursor_cutoff_value"] = new_cursor_cutoff

        else:
            if (
                state["cursor_pk"] is not None
                and str(new_cursor_pk)
                == str(state["cursor_pk"])
            ):
                raise RuntimeError(
                    f"{table}: cursor did not advance"
                )

        append_rows_jsonl(table, rows)

        state["cursor_pk"] = new_cursor_pk
        state["rows_fetched"] += len(rows)
        state["updated_at"] = now_iso()

        save_work_state(table, state)

        test_stop = os.environ.get("MIGRATOR_TEST_STOP_AFTER_PAGE")

        if (
            test_stop
            and state["page_no"] >= int(test_stop)
        ):
            raise RuntimeError(
                f"TEST STOP after page {state['page_no']} "
                f"(checkpoint saved safely)"
            )

        if (
            state["expected_snapshot_rows"] is not None
            and state["rows_fetched"]
            > state["expected_snapshot_rows"]
        ):
            raise RuntimeError(
                f"{table}: fetched more rows "
                f"than snapshot expected"
            )

        if len(rows) < page_size:
            break

    if table in GIANT_PK_CUTOFF_TABLES:
        state["expected_snapshot_rows"] = (
            state["rows_fetched"]
        )

        print(
            "GIANT SNAPSHOT ROWS FINAL:",
            state["expected_snapshot_rows"],
        )

    elif (
        state["rows_fetched"]
        != state["expected_snapshot_rows"]
    ):
        raise RuntimeError(
            f"{table}: snapshot expected "
            f"{state['expected_snapshot_rows']} rows, "
            f"got {state['rows_fetched']}"
        )

    state["status"] = "fetched"
    state["updated_at"] = now_iso()

    save_work_state(table, state)

    if table in LARGE_STREAM_TABLES:
        print(
            "SOURCE PAGINATION COMPLETE:",
            state["page_no"],
            "pages /",
            state["rows_fetched"],
            "rows",
        )
        print(
            "LARGE STREAM SOURCE STORED ON DISK:",
            temp_rows_path(table),
        )
        return None, state

    rows = load_rows_jsonl(table)

    if len(rows) != state["expected_snapshot_rows"]:
        raise RuntimeError(
            f"{table}: JSONL row count mismatch"
        )

    print(
        "SOURCE PAGINATION COMPLETE:",
        state["page_no"],
        "pages /",
        len(rows),
        "rows",
    )

    return rows, state


def postgres_array_literal(value):
    """
    Convert Python/JSON arrays returned by the source endpoint
    into PostgreSQL array input syntax.

    Supports nested arrays as well as scalar elements.
    """

    if value is None:
        return r"\N"

    if not isinstance(value, list):
        raise RuntimeError(
            f"Expected list for PostgreSQL ARRAY, got {type(value).__name__}"
        )

    def encode_element(v):
        if v is None:
            return "NULL"

        if isinstance(v, list):
            return "{" + ",".join(
                encode_element(x)
                for x in v
            ) + "}"

        if isinstance(v, bool):
            text = "true" if v else "false"
        else:
            text = str(v)

        text = (
            text
            .replace("\\\\", "\\\\\\\\")
            .replace('"', '\\\\"')
        )

        return f'"{text}"'

    return "{" + ",".join(
        encode_element(x)
        for x in value
    ) + "}"


def write_csv(table, rows):
    meta = MANIFEST[table]
    columns = meta["writable_columns"]

    path = TEMP_DIR / f"{table}-v4.3.csv"

    with open(
        path,
        "w",
        newline="",
        encoding="utf-8",
    ) as f:
        writer = csv.writer(f)
        writer.writerow(columns)

        for record in rows:
            output = []

            for col in columns:
                value = record.get(col)

                col_meta = COLUMN_META[(table, col)]
                data_type = col_meta["data_type"]

                if value is None:
                    output.append(r"\N")

                elif data_type == "ARRAY":
                    output.append(
                        postgres_array_literal(value)
                    )

                elif isinstance(value, bool):
                    output.append(
                        "true" if value else "false"
                    )

                elif data_type in ("json", "jsonb"):
                    output.append(
                        json.dumps(
                            value,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                    )

                else:
                    output.append(str(value))

            writer.writerow(output)

    os.chmod(path, 0o600)

    return path


def fetch_target_rows(table):
    meta = MANIFEST[table]

    columns = meta["all_columns"]
    pk_columns = meta["primary_key"]["columns"]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    order_by = ", ".join(
        f'"{c}"'
        for c in pk_columns
    )

    # Generic paged target verification for larger
    # single-column-PK tables.
    #
    # This avoids returning one giant json_agg result through psql.
    # The target is read in deterministic PK order so canonical_hash()
    # remains exact and compatible with the frozen source snapshot.
    manifest_rows = int(meta.get("row_count") or 0)

    use_paged_verification = (
        len(pk_columns) == 1
        and (
            table == "posts"
            or manifest_rows >= 10000
        )
    )

    if use_paged_verification:
        pk = pk_columns[0]
        page_size = 500
        cursor = None
        page_no = 0
        rows = []

        while True:
            where_sql = ""

            if cursor is not None:
                escaped = str(cursor).replace("'", "''")

                # The RHS is an PostgreSQL unknown literal.
                # PostgreSQL coerces it to the PK column type
                # (uuid, bigint, integer, text, date, etc.).
                where_sql = (
                    f'where "{pk}" > \'{escaped}\''
                )

            sql = f"""
select coalesce(
  json_agg(t order by "{pk}"),
  '[]'::json
)::text
from (
  select {qcols}
  from public."{table}"
  {where_sql}
  order by "{pk}"
  limit {page_size}
) t;
""".strip()

            out = run_target_psql([
                "-At",
                "-c",
                sql,
            ]).strip()

            page = json.loads(out)

            if not page:
                break

            rows.extend(page)
            page_no += 1
            cursor = page[-1][pk]

            print(
                f"TARGET VERIFY PAGE {page_no}: "
                f"{len(page)} rows / total {len(rows)}"
            )

            if len(page) < page_size:
                break

        print(
            "TARGET PAGINATION COMPLETE:",
            f"{page_no} pages / {len(rows)} rows"
        )

        return rows

    sql = f"""
select coalesce(
  json_agg(t order by {order_by}),
  '[]'::json
)::text
from (
  select {qcols}
  from public."{table}"
) t;
""".strip()

    out = run_target_psql([
        "-At",
        "-c",
        sql,
    ]).strip()

    return json.loads(out)

def save_final_state(
    table,
    rows,
    source_hash,
    target_hash,
    work_state,
):
    state = {
        "table": table,
        "status": "verified",
        "rows": rows,
        "source_sha256": source_hash,
        "target_sha256": target_hash,
        "migrator_version": "4.3",
        "snapshot_cutoff": work_state.get("cutoff"),
        "cutoff_column": work_state.get("cutoff_column"),
        "completed_at": now_iso(),
    }

    path = STATE_DIR / f"{table}.json"

    path.write_text(
        json.dumps(
            state,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    os.chmod(path, 0o600)

    return path


def apply_table(table, reset=False):
    batch_authorized = (
        os.environ.get("MIGRATOR_BATCH_AUTHORIZED") == "1"
    )

    if (
        table not in APPLY_ALLOWLIST
        and not batch_authorized
    ):
        raise RuntimeError(
            f"APPLY safety lock: {table} is not allowlisted"
        )

    meta = MANIFEST[table]

    policy = meta["policy"]

    policy_allowed = (
        policy == "COPY"
        or (
            policy == "MIGRATE_GIANT_LAST"
            and table in GIANT_PK_CUTOFF_TABLES
        )
    )

    if not policy_allowed:
        raise RuntimeError(
            f"{table}: policy is {policy}, not permitted for this apply mode"
        )

    if policy == "MIGRATE_GIANT_LAST":
        print(
            "GIANT POLICY AUTHORIZED:",
            table,
            policy,
        )

    if reset:
        reset_work_state(table)
        print("WORK STATE RESET:", table)

    log(f"APPLY start table={table}")

    before = target_count(table)

    SOURCE_WINS_UPSERT_TABLES = {
        "pet_states",
    }

    source_wins_upsert = (
        table in SOURCE_WINS_UPSERT_TABLES
    )

    SECURITY_SENSITIVE_EXACT_TABLES = {
        "user_roles",
    }

    security_sensitive_exact = (
        table in SECURITY_SENSITIVE_EXACT_TABLES
    )

    resume_verify_only = False

    if before != 0 and not source_wins_upsert:
        if table in {
            "posts",
            "live_session_events",
        }:
            resume_path = work_state_path(table)

            if not resume_path.exists():
                raise RuntimeError(
                    f"{table}: target has {before} rows but "
                    f"no resumable work state exists"
                )

            resume_state = json.loads(
                resume_path.read_text(encoding="utf-8")
            )

            resume_expected = int(
                resume_state.get(
                    "expected_snapshot_rows",
                    -1,
                )
            )

            if (
                resume_state.get("status") == "fetched"
                and before == resume_expected
            ):
                resume_verify_only = True
                print(
                    "RESUME VERIFY-ONLY MODE:",
                    f"target already has {before} rows; "
                    "COPY will be skipped"
                )
            else:
                raise RuntimeError(
                    f"{table}: unsafe non-empty target resume; "
                    f"target={before}, "
                    f"work_status={resume_state.get('status')}, "
                    f"expected={resume_expected}"
                )
        else:
            raise RuntimeError(
                f"{table}: target preflight expected 0 rows, "
                f"got {before}"
            )

    if source_wins_upsert:
        print(
            f"SOURCE-WINS UPSERT MODE: "
            f"target currently has {before} rows"
        )

    trigger_before = trigger_states(table)

    source_rows, work_state = fetch_source_resumable(table)

    # --------------------------------------------------
    # profiles cycle-safe initial migration
    #
    # profiles.current_live_session_id -> live_sessions.id
    # profiles.pinned_post_id          -> posts.id
    #
    # Both columns are nullable. Their original source
    # values are preserved locally, while the initial
    # target copy neutralizes them to NULL. They will be
    # backfilled only after both parent tables exist.
    # --------------------------------------------------

    if table == "profiles":
        cycle_columns = [
            "current_live_session_id",
            "pinned_post_id",
        ]

        cycle_refs = []

        for row in source_rows:
            if any(row.get(c) is not None for c in cycle_columns):
                cycle_refs.append({
                    "id": row["id"],
                    "current_live_session_id": row.get(
                        "current_live_session_id"
                    ),
                    "pinned_post_id": row.get("pinned_post_id"),
                })

        cycle_path = STATE_DIR / "profiles-cycle-refs.json"

        cycle_payload = {
            "table": "profiles",
            "snapshot_created_at": now_iso(),
            "cycle_columns": cycle_columns,
            "rows_with_nonnull_cycle_refs": len(cycle_refs),
            "rows": cycle_refs,
            "backfill_status": "pending",
        }

        cycle_path.write_text(
            json.dumps(
                cycle_payload,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        os.chmod(cycle_path, 0o600)

        neutralized_rows = []

        for row in source_rows:
            row_copy = dict(row)
            row_copy["current_live_session_id"] = None
            row_copy["pinned_post_id"] = None
            neutralized_rows.append(row_copy)

        source_rows = neutralized_rows

        work_state["cycle_backfill_pending"] = True
        work_state["cycle_columns_neutralized"] = cycle_columns
        work_state["cycle_refs_file"] = str(cycle_path)
        work_state["cycle_refs_count"] = len(cycle_refs)
        save_work_state(table, work_state)

        print(
            "PROFILES CYCLE-SAFE MODE:",
            f"{len(cycle_refs)} rows with deferred cycle refs"
        )
        print(
            "PROFILES CYCLE REFS:",
            cycle_path
        )

    # --------------------------------------------------
    # messages cycle-safe initial migration
    #
    # messages.reply_to_id -> messages.id
    #
    # Preserve original self-reference values locally and
    # neutralize reply_to_id to NULL for the initial copy.
    # Backfill only after all messages exist on target.
    # --------------------------------------------------
    if table == "messages":
        cycle_refs = []

        for row in source_rows:
            if row.get("reply_to_id") is not None:
                cycle_refs.append({
                    "id": row["id"],
                    "reply_to_id": row.get("reply_to_id"),
                })

        cycle_path = STATE_DIR / "messages-cycle-refs.json"

        cycle_payload = {
            "table": "messages",
            "snapshot_created_at": now_iso(),
            "cycle_columns": ["reply_to_id"],
            "rows_with_nonnull_cycle_refs": len(cycle_refs),
            "rows": cycle_refs,
            "backfill_status": "pending",
        }

        cycle_path.write_text(
            json.dumps(
                cycle_payload,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(cycle_path, 0o600)

        neutralized_rows = []

        for row in source_rows:
            row_copy = dict(row)
            row_copy["reply_to_id"] = None
            neutralized_rows.append(row_copy)

        source_rows = neutralized_rows

        work_state["cycle_backfill_pending"] = True
        work_state["cycle_columns_neutralized"] = [
            "reply_to_id",
        ]
        work_state["cycle_refs_file"] = str(cycle_path)
        work_state["cycle_refs_count"] = len(cycle_refs)

        save_work_state(table, work_state)

        print(
            "MESSAGES CYCLE-SAFE MODE:",
            f"{len(cycle_refs)} rows with deferred reply refs"
        )
        print(
            "MESSAGES CYCLE REFS:",
            cycle_path
        )

    # --------------------------------------------------
    # reel_comments cycle-safe initial migration
    #
    # reel_comments.parent_comment_id -> reel_comments.id
    #
    # Preserve original self-reference values locally and
    # neutralize parent_comment_id to NULL for initial copy.
    # Backfill only after all reel_comments exist on target.
    # --------------------------------------------------
    if table == "reel_comments":
        cycle_refs = []

        for row in source_rows:
            if row.get("parent_comment_id") is not None:
                cycle_refs.append({
                    "id": row["id"],
                    "parent_comment_id": row.get("parent_comment_id"),
                })

        cycle_path = STATE_DIR / "reel-comments-cycle-refs.json"

        cycle_payload = {
            "table": "reel_comments",
            "snapshot_created_at": now_iso(),
            "cycle_columns": ["parent_comment_id"],
            "rows_with_nonnull_cycle_refs": len(cycle_refs),
            "rows": cycle_refs,
            "backfill_status": (
                "pending" if cycle_refs else "not_required"
            ),
        }

        cycle_path.write_text(
            json.dumps(
                cycle_payload,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(cycle_path, 0o600)

        neutralized_rows = []

        for row in source_rows:
            row_copy = dict(row)
            row_copy["parent_comment_id"] = None
            neutralized_rows.append(row_copy)

        source_rows = neutralized_rows

        work_state["cycle_backfill_pending"] = bool(cycle_refs)
        work_state["cycle_columns_neutralized"] = [
            "parent_comment_id",
        ]
        work_state["cycle_refs_file"] = str(cycle_path)
        work_state["cycle_refs_count"] = len(cycle_refs)

        save_work_state(table, work_state)

        print(
            "REEL_COMMENTS CYCLE-SAFE MODE:",
            f"{len(cycle_refs)} rows with deferred parent refs"
        )
        print(
            "REEL_COMMENTS CYCLE REFS:",
            cycle_path
        )


    # --------------------------------------------------
    # comments cycle-safe initial migration
    #
    # comments.parent_comment_id -> comments.id
    #
    # Preserve original self-reference values locally and
    # neutralize parent_comment_id to NULL for initial copy.
    # Backfill only after all comments exist on target.
    # --------------------------------------------------

    if table == "comments":
        cycle_refs = []

        for row in source_rows:
            if row.get("parent_comment_id") is not None:
                cycle_refs.append({
                    "id": row["id"],
                    "parent_comment_id": row.get(
                        "parent_comment_id"
                    ),
                })

        cycle_path = (
            STATE_DIR
            / "comments-cycle-refs.json"
        )

        cycle_payload = {
            "table": "comments",
            "snapshot_created_at": now_iso(),
            "cycle_columns": ["parent_comment_id"],
            "rows_with_nonnull_cycle_refs": len(cycle_refs),
            "rows": cycle_refs,
            "backfill_status": (
                "pending" if cycle_refs else "not_required"
            ),
        }

        cycle_path.write_text(
            json.dumps(
                cycle_payload,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        os.chmod(cycle_path, 0o600)

        neutralized_rows = []

        for row in source_rows:
            row_copy = dict(row)
            row_copy["parent_comment_id"] = None
            neutralized_rows.append(row_copy)

        source_rows = neutralized_rows

        work_state["cycle_backfill_pending"] = bool(
            cycle_refs
        )
        work_state["cycle_columns_neutralized"] = [
            "parent_comment_id",
        ]
        work_state["cycle_refs_file"] = str(cycle_path)
        work_state["cycle_refs_count"] = len(cycle_refs)
        work_state["final_exact_reconcile_required"] = True

        save_work_state(table, work_state)

        print(
            "COMMENTS CYCLE-SAFE MODE:",
            f"{len(cycle_refs)} rows with deferred parent refs"
        )
        print(
            "COMMENTS CYCLE REFS:",
            cycle_path
        )
        print(
            "COMMENTS FINAL EXACT RECONCILE:",
            "REQUIRED"
        )


    # --------------------------------------------------
    # pplp_mint_requests cycle-safe initial migration
    #
    # parent_request_id -> pplp_mint_requests.id
    #
    # Preserve self-reference values locally and set
    # parent_request_id to NULL during the initial copy.
    # Backfill after every request row exists on target.
    # --------------------------------------------------
    if table == "pplp_mint_requests":
        cycle_refs = []

        for row in source_rows:
            if row.get("parent_request_id") is not None:
                cycle_refs.append({
                    "id": row["id"],
                    "parent_request_id": row.get(
                        "parent_request_id"
                    ),
                })

        cycle_path = (
            STATE_DIR
            / "pplp-mint-requests-cycle-refs.json"
        )

        cycle_payload = {
            "table": "pplp_mint_requests",
            "snapshot_created_at": now_iso(),
            "cycle_columns": ["parent_request_id"],
            "rows_with_nonnull_cycle_refs": len(cycle_refs),
            "rows": cycle_refs,
            "backfill_status": (
                "pending" if cycle_refs else "not_required"
            ),
        }

        cycle_path.write_text(
            json.dumps(
                cycle_payload,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(cycle_path, 0o600)

        neutralized_rows = []

        for row in source_rows:
            row_copy = dict(row)
            row_copy["parent_request_id"] = None
            neutralized_rows.append(row_copy)

        source_rows = neutralized_rows

        work_state["cycle_backfill_pending"] = bool(
            cycle_refs
        )
        work_state["cycle_columns_neutralized"] = [
            "parent_request_id",
        ]
        work_state["cycle_refs_file"] = str(cycle_path)
        work_state["cycle_refs_count"] = len(cycle_refs)

        save_work_state(table, work_state)

        print(
            "PPLP_MINT_REQUESTS CYCLE-SAFE MODE:",
            f"{len(cycle_refs)} rows with deferred parent refs"
        )
        print(
            "PPLP_MINT_REQUESTS CYCLE REFS:",
            cycle_path
        )


    # --------------------------------------------------
    # live_sessions SAFE COPY
    #
    # Historical session data is preserved while
    # environment-specific streaming runtime state and
    # credentials are neutralized.
    #
    # No old RTMP/Cloudflare credentials are carried into
    # the target environment.
    # --------------------------------------------------
    if table == "live_sessions":
        neutralized_counts = {
            "rtmp_config_id": 0,
            "stream_key_encrypted": 0,
            "armed_session_token": 0,
            "rtmps_url": 0,
            "cloudflare_live_input_id": 0,
            "cloudflare_input_id": 0,
            "is_input_armed_true": 0,
            "source_connected_true": 0,
            "preview_ready_true": 0,
        }

        transformed_rows = []

        for row in source_rows:
            row_copy = dict(row)

            for col in [
                "rtmp_config_id",
                "stream_key_encrypted",
                "armed_session_token",
                "rtmps_url",
                "cloudflare_live_input_id",
                "cloudflare_input_id",
            ]:
                if row_copy.get(col) is not None:
                    neutralized_counts[col] += 1
                row_copy[col] = None

            if row_copy.get("is_input_armed") is True:
                neutralized_counts[
                    "is_input_armed_true"
                ] += 1

            if row_copy.get("source_connected") is True:
                neutralized_counts[
                    "source_connected_true"
                ] += 1

            if row_copy.get("preview_ready") is True:
                neutralized_counts[
                    "preview_ready_true"
                ] += 1

            row_copy["is_input_armed"] = False
            row_copy["source_connected"] = False
            row_copy["preview_ready"] = False

            transformed_rows.append(row_copy)

        source_rows = transformed_rows

        work_state["safe_copy_policy"] = (
            "HISTORICAL_WITH_RUNTIME_NEUTRALIZATION"
        )
        work_state["runtime_fields_neutralized"] = [
            "rtmp_config_id",
            "stream_key_encrypted",
            "armed_session_token",
            "rtmps_url",
            "cloudflare_live_input_id",
            "cloudflare_input_id",
            "is_input_armed",
            "source_connected",
            "preview_ready",
        ]
        work_state["runtime_neutralized_counts"] = (
            neutralized_counts
        )
        work_state["final_exact_reconcile_required"] = True

        save_work_state(table, work_state)

        print(
            "LIVE_SESSIONS SAFE COPY MODE:",
            "historical data + runtime neutralization"
        )
        print(
            "LIVE_SESSIONS FINAL EXACT RECONCILE:",
            "REQUIRED"
        )


    numeric_columns = target_numeric_columns(table)

    if table in LARGE_STREAM_TABLES:
        expected = int(
            work_state["expected_snapshot_rows"]
        )

        source_hash, source_hash_rows = (
            source_jsonl_stream_hash(
                table,
                meta["primary_key"]["columns"],
                numeric_columns,
            )
        )

        if source_hash_rows != expected:
            raise RuntimeError(
                f"{table}: source stream hash count "
                f"expected {expected}, got {source_hash_rows}"
            )

        csv_path, csv_rows = (
            write_csv_from_jsonl_stream(table)
        )

        if csv_rows != expected:
            raise RuntimeError(
                f"{table}: source stream CSV count "
                f"expected {expected}, got {csv_rows}"
            )

    else:
        expected = len(source_rows)

        source_hash = canonical_hash(
            source_rows,
            meta["primary_key"]["columns"],
            numeric_columns,
        )

        csv_path = write_csv(
            table,
            source_rows,
        )

    if os.environ.get("MIGRATOR_STOP_AFTER_SOURCE_PREP") == "1":
        print()
        print("=== SOURCE PREP COMPLETE ===")
        print("TABLE:", table)
        print("SOURCE ROWS:", expected)
        print("SOURCE SHA256:", source_hash)
        print("CSV FILE:", csv_path)
        print("⚠️ TARGET COPY NOT STARTED")
        raise RuntimeError(
            "TEST STOP after source prep "
            "(source snapshot/hash/CSV saved safely)"
        )

    column_list = ",".join(
        f'"{c}"'
        for c in meta["writable_columns"]
    )

    copy_line = (
        f'\\copy public."{table}" '
        f'({column_list}) '
        f"FROM '{csv_path}' "
        f"WITH (FORMAT csv, HEADER true, NULL '\\N')"
    )

    if source_wins_upsert:
        pk_columns = meta["primary_key"]["columns"]

        if len(pk_columns) != 1:
            raise RuntimeError(
                f"{table}: source-wins mode currently "
                f"requires single-column PK"
            )

        pk = pk_columns[0]

        # Safety:
        # Any rows already present on target must correspond
        # to rows that also exist in the source snapshot.
        target_pk_sql = f"""
select "{pk}"::text
from public."{table}"
order by "{pk}";
""".strip()

        target_pk_out = run_target_psql([
            "-At",
            "-c",
            target_pk_sql,
        ])

        target_pks = {
            x.strip()
            for x in target_pk_out.splitlines()
            if x.strip()
        }

        source_pks = {
            str(row[pk])
            for row in source_rows
        }

        target_only = sorted(
            target_pks - source_pks
        )

        if target_only:
            raise RuntimeError(
                f"{table}: target contains "
                f"{len(target_only)} PK(s) absent from source; "
                f"refusing source-wins merge"
            )

        update_columns = [
            c
            for c in meta["writable_columns"]
            if c != pk
        ]

        update_set = ",\n  ".join(
            f'"{c}" = EXCLUDED."{c}"'
            for c in update_columns
        )

        select_columns = ", ".join(
            f'"{c}"'
            for c in meta["writable_columns"]
        )

        stage_name = (
            f"_migration_stage_{table}"
        )

        stage_copy_line = (
            f'\\copy "{stage_name}" '
            f'({column_list}) '
            f"FROM '{csv_path}' "
            f"WITH (FORMAT csv, HEADER true, NULL '\\N')"
        )

        sql = f"""
BEGIN;

ALTER TABLE public."{table}"
DISABLE TRIGGER USER;

CREATE TEMP TABLE "{stage_name}"
(LIKE public."{table}" INCLUDING DEFAULTS INCLUDING GENERATED)
ON COMMIT DROP;

{stage_copy_line}

INSERT INTO public."{table}" ({column_list})
SELECT {select_columns}
FROM "{stage_name}"
ON CONFLICT ("{pk}")
DO UPDATE SET
  {update_set};

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM public."{table}";

  IF v_count <> {expected} THEN
    RAISE EXCEPTION
      'Target count mismatch before commit: expected {expected}, got %',
      v_count;
  END IF;
END
$$;

ALTER TABLE public."{table}"
ENABLE TRIGGER USER;

COMMIT;
""".strip()

    elif security_sensitive_exact:
        stage_name = (
            f"_migration_stage_{table}"
        )

        stage_copy_line = (
            f'\\copy "{stage_name}" '
            f'({column_list}) '
            f"FROM '{csv_path}' "
            f"WITH (FORMAT csv, HEADER true, NULL '\\N')"
        )

        select_columns = ", ".join(
            f'"{c}"'
            for c in meta["writable_columns"]
        )

        compare_columns = ", ".join(
            f'"{c}"'
            for c in meta["all_columns"]
        )

        sql = f"""
BEGIN;

ALTER TABLE public."{table}"
DISABLE TRIGGER USER;

CREATE TEMP TABLE "{stage_name}"
(LIKE public."{table}" INCLUDING DEFAULTS INCLUDING GENERATED)
ON COMMIT DROP;

{stage_copy_line}

DO $$
DECLARE
  v_stage_count bigint;
BEGIN
  SELECT count(*)
  INTO v_stage_count
  FROM "{stage_name}";

  IF v_stage_count <> {expected} THEN
    RAISE EXCEPTION
      'Security staging count mismatch: expected {expected}, got %',
      v_stage_count;
  END IF;
END
$$;

INSERT INTO public."{table}" ({column_list})
SELECT {select_columns}
FROM "{stage_name}";

DO $$
DECLARE
  v_target_count bigint;
  v_stage_minus_target bigint;
  v_target_minus_stage bigint;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM public."{table}";

  IF v_target_count <> {expected} THEN
    RAISE EXCEPTION
      'Security target count mismatch before commit: expected {expected}, got %',
      v_target_count;
  END IF;

  SELECT count(*)
  INTO v_stage_minus_target
  FROM (
    SELECT {compare_columns}
    FROM "{stage_name}"
    EXCEPT ALL
    SELECT {compare_columns}
    FROM public."{table}"
  ) q;

  SELECT count(*)
  INTO v_target_minus_stage
  FROM (
    SELECT {compare_columns}
    FROM public."{table}"
    EXCEPT ALL
    SELECT {compare_columns}
    FROM "{stage_name}"
  ) q;

  IF v_stage_minus_target <> 0
     OR v_target_minus_stage <> 0 THEN
    RAISE EXCEPTION
      'Security exact-compare failed before commit: stage_minus_target=%, target_minus_stage=%',
      v_stage_minus_target,
      v_target_minus_stage;
  END IF;
END
$$;

ALTER TABLE public."{table}"
ENABLE TRIGGER USER;

COMMIT;
""".strip()

    else:
        sql = f"""
BEGIN;

ALTER TABLE public."{table}"
DISABLE TRIGGER USER;

{copy_line}

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM public."{table}";

  IF v_count <> {expected} THEN
    RAISE EXCEPTION
      'Target count mismatch before commit: expected {expected}, got %',
      v_count;
  END IF;
END
$$;

ALTER TABLE public."{table}"
ENABLE TRIGGER USER;

COMMIT;
""".strip()

    if resume_verify_only:
        print(
            "SKIP TARGET COPY:",
            "safe fetched-state resume verification"
        )
    else:
        run_target_psql(
            input_text=sql
        )

    after = target_count(table)

    if after != expected:
        raise RuntimeError(
            f"{table}: post-commit expected {expected}, "
            f"got {after}"
        )

    trigger_after = trigger_states(table)

    if trigger_after != trigger_before:
        raise RuntimeError(
            f"{table}: trigger state mismatch after commit"
        )

    if table in LARGE_STREAM_TABLES:
        target_hash, target_hash_rows = target_stream_hash(
            table,
            meta["primary_key"]["columns"],
            numeric_columns,
        )

        if target_hash_rows != expected:
            raise RuntimeError(
                f"{table}: target stream hash count "
                f"expected {expected}, got {target_hash_rows}"
            )

    else:
        target_rows = fetch_target_rows(table)

        target_hash = canonical_hash(
            target_rows,
            meta["primary_key"]["columns"],
            numeric_columns,
        )

    if source_hash != target_hash:
        raise RuntimeError(
            f"{table}: HASH MISMATCH "
            f"source={source_hash} target={target_hash}"
        )

    state_path = save_final_state(
        table,
        expected,
        source_hash,
        target_hash,
        work_state,
    )


    if table == "pplp_mint_requests":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        cycle_path = (
            STATE_DIR
            / "pplp-mint-requests-cycle-refs.json"
        )

        cycle_payload = json.loads(
            cycle_path.read_text(encoding="utf-8")
        )

        cycle_refs_count = int(
            cycle_payload.get(
                "rows_with_nonnull_cycle_refs",
                0,
            )
        )

        final_state["cycle_backfill_pending"] = (
            cycle_refs_count > 0
        )
        final_state["cycle_columns_neutralized"] = [
            "parent_request_id",
        ]
        final_state["cycle_refs_file"] = str(cycle_path)
        final_state["cycle_refs_count"] = cycle_refs_count

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(state_path, 0o600)


    if table == "live_sessions":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        final_state["safe_copy_policy"] = (
            "HISTORICAL_WITH_RUNTIME_NEUTRALIZATION"
        )
        final_state["runtime_fields_neutralized"] = [
            "rtmp_config_id",
            "stream_key_encrypted",
            "armed_session_token",
            "rtmps_url",
            "cloudflare_live_input_id",
            "cloudflare_input_id",
            "is_input_armed",
            "source_connected",
            "preview_ready",
        ]
        final_state["runtime_neutralized_counts"] = (
            work_state.get(
                "runtime_neutralized_counts",
                {}
            )
        )
        final_state["final_exact_reconcile_required"] = True
        final_state["rtmp_config_policy"] = (
            "REBUILD_ROTATE_NOT_COPIED"
        )

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(state_path, 0o600)

    if table == "messages":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )
        final_state["cycle_backfill_pending"] = True
        final_state["cycle_columns_neutralized"] = [
            "reply_to_id",
        ]
        final_state["cycle_refs_file"] = str(
            STATE_DIR / "messages-cycle-refs.json"
        )
        cycle_payload = json.loads(
            (
                STATE_DIR / "messages-cycle-refs.json"
            ).read_text(encoding="utf-8")
        )

        final_state["cycle_refs_count"] = int(
            cycle_payload.get(
                "rows_with_nonnull_cycle_refs",
                0,
            )
        )

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    if table == "reel_comments":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        cycle_path = (
            STATE_DIR / "reel-comments-cycle-refs.json"
        )

        cycle_payload = json.loads(
            cycle_path.read_text(encoding="utf-8")
        )

        cycle_refs_count = int(
            cycle_payload.get(
                "rows_with_nonnull_cycle_refs",
                0,
            )
        )

        final_state["cycle_backfill_pending"] = (
            cycle_refs_count > 0
        )
        final_state["cycle_columns_neutralized"] = [
            "parent_comment_id",
        ]
        final_state["cycle_refs_file"] = str(cycle_path)
        final_state["cycle_refs_count"] = cycle_refs_count

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        os.chmod(state_path, 0o600)


    if table == "comments":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        cycle_path = (
            STATE_DIR / "comments-cycle-refs.json"
        )

        cycle_payload = json.loads(
            cycle_path.read_text(encoding="utf-8")
        )

        cycle_refs_count = int(
            cycle_payload.get(
                "rows_with_nonnull_cycle_refs",
                0,
            )
        )

        final_state["cycle_backfill_pending"] = (
            cycle_refs_count > 0
        )
        final_state["cycle_columns_neutralized"] = [
            "parent_comment_id",
        ]
        final_state["cycle_refs_file"] = str(cycle_path)
        final_state["cycle_refs_count"] = cycle_refs_count
        final_state["final_exact_reconcile_required"] = True

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        os.chmod(state_path, 0o600)


    if table == "profiles":
        final_state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        final_state["cycle_backfill_pending"] = True
        final_state["cycle_columns_neutralized"] = [
            "current_live_session_id",
            "pinned_post_id",
        ]
        final_state["cycle_refs_file"] = str(
            STATE_DIR / "profiles-cycle-refs.json"
        )

        cycle_payload = json.loads(
            (
                STATE_DIR / "profiles-cycle-refs.json"
            ).read_text(encoding="utf-8")
        )

        final_state["cycle_refs_count"] = int(
            cycle_payload.get(
                "rows_with_nonnull_cycle_refs",
                0,
            )
        )

        state_path.write_text(
            json.dumps(
                final_state,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        os.chmod(state_path, 0o600)

    work_state["status"] = "verified"
    work_state["updated_at"] = now_iso()

    save_work_state(table, work_state)

    print()
    print("=== MAC MIGRATOR V4.3 APPLY SUCCESS ===")
    print("TABLE:", table)
    print("SOURCE ROWS:", expected)
    print("TARGET ROWS:", after)
    print("SOURCE SHA256:", source_hash)
    print("TARGET SHA256:", target_hash)
    print("HASH MATCH:", source_hash == target_hash)
    print("TRIGGERS BEFORE:", trigger_before)
    print("TRIGGERS AFTER:", trigger_after)
    print(
        "TRIGGER STATE RESTORED:",
        trigger_before == trigger_after,
    )
    print("WORK STATE:", work_state_path(table))
    print("STATE FILE:", state_path)
    print("=======================================")

    log(
        f"APPLY success table={table} "
        f"rows={expected} "
        f"hash_match=true "
        f"triggers_restored=true"
    )


def main():
    parser = argparse.ArgumentParser(
        description="FUN Profile Mac Migrator v4.3"
    )

    parser.add_argument(
        "--table",
        required=True,
    )

    parser.add_argument(
        "--apply",
        action="store_true",
    )

    parser.add_argument(
        "--reset-work",
        action="store_true",
    )

    args = parser.parse_args()

    if not args.apply:
        print(
            "ERROR: explicit --apply required",
            file=sys.stderr,
        )
        sys.exit(2)

    if args.table not in MANIFEST:
        print(
            f"ERROR: unknown table {args.table}",
            file=sys.stderr,
        )
        sys.exit(2)

    try:
        apply_table(
            args.table,
            reset=args.reset_work,
        )

    except Exception as e:
        log(f"ERROR: {e}")
        print(
            f"\nERROR: {e}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
