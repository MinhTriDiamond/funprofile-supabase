#!/usr/bin/env python3

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

MANIFEST_FILE = ROOT / "migration-snapshot/28-migration-manifest.json"
STATE_DIR = ROOT / "migration-state"
LOG_DIR = ROOT / "migration-logs"
TEMP_DIR = ROOT / "migration-temp"

for d in (STATE_DIR, LOG_DIR, TEMP_DIR):
    d.mkdir(parents=True, exist_ok=True)


# Safety lock for first v4 test.
APPLY_ALLOWLIST = {
    "external_wallet_labels",
    "btc_history_repair_audit_20260612",
    "btc_resolver_shadow_log",
}


def log(message):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] {message}"
    print(line)

    with open(
        LOG_DIR / "mac-migrator-v4.log",
        "a",
        encoding="utf-8",
    ) as f:
        f.write(line + "\n")


def load_manifest():
    data = json.loads(
        MANIFEST_FILE.read_text(encoding="utf-8")
    )

    return {
        t["table_name"]: t
        for t in data["tables"]
    }


MANIFEST = load_manifest()


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


def canonical_hash(rows, pk_columns):
    def key(row):
        return tuple(
            str(row[c])
            for c in pk_columns
        )

    ordered = sorted(rows, key=key)

    payload = json.dumps(
        ordered,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(payload).hexdigest()


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


def sql_literal(value, udt_name):
    if udt_name in ("int2", "int4", "int8"):
        return str(int(value))

    escaped = str(value).replace("'", "''")

    cast_map = {
        "uuid": "uuid",
        "text": "text",
        "date": "date",
    }

    cast = cast_map.get(udt_name)

    if not cast:
        raise RuntimeError(
            f"Unsupported cursor type: {udt_name}"
        )

    return f"'{escaped}'::{cast}"


def fetch_source(table):
    meta = MANIFEST[table]

    columns = meta["all_columns"]
    pk_columns = meta["primary_key"]["columns"]

    if len(pk_columns) != 1:
        raise RuntimeError(
            f"{table}: single-column PK required"
        )

    pk = pk_columns[0]

    cols_meta = json.loads(
        (
            ROOT /
            "migration-snapshot/04a-table-columns.json"
        ).read_text(encoding="utf-8")
    )["rows"]

    pk_meta = next(
        r for r in cols_meta
        if r["table_name"] == table
        and r["column_name"] == pk
    )

    udt_name = pk_meta["udt_name"]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    # --------------------------------------------------
    # Stable-cutoff mode for live production tables
    # --------------------------------------------------

    cutoff_column = None

    if table == "btc_resolver_shadow_log":
        cutoff_column = "created_at"

    cutoff = None

    if cutoff_column:
        cutoff_result = run_source_sql(f"""
select
  statement_timestamp() as cutoff,
  count(*)::bigint as row_count
from public."{table}"
where "{cutoff_column}" <= statement_timestamp()
""".strip())

        row = cutoff_result["rows"][0]

        cutoff = row["cutoff"]
        expected = int(row["row_count"])

        print("SOURCE SNAPSHOT CUTOFF:", cutoff)
        print("SOURCE SNAPSHOT ROWS:", expected)

    else:
        if meta["count_type"] != "exact":
            raise RuntimeError(
                f"{table}: exact source count required"
            )

        expected = int(meta["row_count"])

    page_size = 500
    cursor_pk = None
    cursor_cutoff_col = None
    all_rows = []
    total_ms = 0
    page_no = 0

    while True:
        predicates = []

        if cutoff_column:
            cutoff_literal = (
                "'" +
                str(cutoff).replace("'", "''") +
                "'::timestamptz"
            )

            predicates.append(
                f'"{cutoff_column}" <= {cutoff_literal}'
            )

            if cursor_pk is not None:
                cursor_ts_literal = (
                    "'" +
                    str(cursor_cutoff_col).replace("'", "''") +
                    "'::timestamptz"
                )

                predicates.append(
                    f'("{cutoff_column}", "{pk}") > '
                    f'({cursor_ts_literal}, '
                    f'{sql_literal(cursor_pk, udt_name)})'
                )

            order_by = (
                f'"{cutoff_column}" asc, "{pk}" asc'
            )

        else:
            if cursor_pk is not None:
                predicates.append(
                    f'"{pk}" > '
                    f'{sql_literal(cursor_pk, udt_name)}'
                )

            order_by = f'"{pk}" asc'

        where = ""

        if predicates:
            where = (
                "where " +
                " and ".join(predicates)
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

        page_no += 1

        ms = result.get("ms")

        if isinstance(ms, (int, float)):
            total_ms += ms

        print(
            f"SOURCE PAGE {page_no}: "
            f"{len(rows)} rows"
        )

        if not rows:
            break

        new_cursor_pk = rows[-1][pk]

        if cutoff_column:
            new_cursor_cutoff_col = rows[-1][cutoff_column]

            if (
                cursor_pk is not None
                and str(new_cursor_pk) == str(cursor_pk)
                and str(new_cursor_cutoff_col)
                == str(cursor_cutoff_col)
            ):
                raise RuntimeError(
                    f"{table}: source tuple cursor "
                    f"did not advance"
                )

            cursor_cutoff_col = new_cursor_cutoff_col

        else:
            if (
                cursor_pk is not None
                and str(new_cursor_pk) == str(cursor_pk)
            ):
                raise RuntimeError(
                    f"{table}: source cursor did not advance"
                )

        cursor_pk = new_cursor_pk
        all_rows.extend(rows)

        if len(rows) < page_size:
            break

        if len(all_rows) > expected:
            raise RuntimeError(
                f"{table}: fetched more rows "
                f"than snapshot expected"
            )

    if len(all_rows) != expected:
        raise RuntimeError(
            f"{table}: snapshot expected "
            f"{expected} rows, got {len(all_rows)}"
        )

    print(
        f"SOURCE PAGINATION COMPLETE: "
        f"{page_no} pages / {len(all_rows)} rows"
    )

    return all_rows, total_ms

def write_csv(table, rows):
    meta = MANIFEST[table]

    # Generated columns are intentionally omitted from COPY.
    columns = meta["writable_columns"]

    path = TEMP_DIR / f"{table}-v4.csv"

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

                if value is None:
                    output.append(r"\N")

                elif isinstance(value, bool):
                    output.append(
                        "true" if value else "false"
                    )

                elif isinstance(value, (dict, list)):
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


def save_state(table, rows, source_hash, target_hash):
    state = {
        "table": table,
        "status": "verified",
        "rows": rows,
        "source_sha256": source_hash,
        "target_sha256": target_hash,
        "migrator_version": 4,
        "completed_at": datetime.now(
            timezone.utc
        ).isoformat(),
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


def apply_table(table):
    if table not in APPLY_ALLOWLIST:
        raise RuntimeError(
            f"APPLY safety lock: {table} is not allowlisted"
        )

    meta = MANIFEST[table]

    if meta["policy"] != "COPY":
        raise RuntimeError(
            f"{table}: policy is {meta['policy']}, not COPY"
        )

    pk_columns = meta["primary_key"]["columns"]
    writable_columns = meta["writable_columns"]

    log(f"APPLY start table={table}")

    before = target_count(table)

    if before != 0:
        raise RuntimeError(
            f"{table}: target preflight expected 0 rows, "
            f"got {before}"
        )

    trigger_before = trigger_states(table)

    source_rows, source_ms = fetch_source(table)
    expected = len(source_rows)

    source_hash = canonical_hash(
        source_rows,
        pk_columns,
    )

    csv_path = write_csv(
        table,
        source_rows,
    )

    column_list = ",".join(
        f'"{c}"'
        for c in writable_columns
    )

    copy_line = (
        f'\\copy public."{table}" '
        f'({column_list}) '
        f"FROM '{csv_path}' "
        f"WITH (FORMAT csv, HEADER true, NULL '\\N')"
    )

    # Trigger changes are transactional.
    # If COPY/verification fails, ROLLBACK restores trigger state too.
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
            f"{table}: trigger state mismatch after commit: "
            f"before={trigger_before}, after={trigger_after}"
        )

    target_rows = fetch_target_rows(table)

    target_hash = canonical_hash(
        target_rows,
        pk_columns,
    )

    if source_hash != target_hash:
        raise RuntimeError(
            f"{table}: HASH MISMATCH "
            f"source={source_hash} target={target_hash}"
        )

    state_path = save_state(
        table,
        expected,
        source_hash,
        target_hash,
    )

    print()
    print("=== MAC MIGRATOR V4 APPLY SUCCESS ===")
    print("TABLE:", table)
    print("SOURCE ROWS:", len(source_rows))
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
    print("SOURCE MS:", source_ms)
    print("STATE FILE:", state_path)
    print("=====================================")

    log(
        f"APPLY success table={table} "
        f"rows={expected} "
        f"hash_match=true "
        f"triggers_restored=true"
    )


def main():
    parser = argparse.ArgumentParser(
        description="FUN Profile Mac Migrator v4"
    )

    parser.add_argument(
        "--table",
        required=True,
    )

    parser.add_argument(
        "--apply",
        action="store_true",
    )

    args = parser.parse_args()

    if not args.apply:
        print(
            "ERROR: v4 test requires explicit --apply",
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
        apply_table(args.table)

    except Exception as e:
        log(f"ERROR: {e}")
        print(
            f"\nERROR: {e}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
