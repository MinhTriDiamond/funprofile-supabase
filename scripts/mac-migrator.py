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


TABLES = {
    "i18n_languages": {
        "pk": "code",
        "columns": [
            "code",
            "name",
            "native_name",
            "flag_url",
            "direction",
            "is_active",
            "coverage_percent",
            "sort_order",
            "created_at",
            "updated_at",
        ],
    }
}


ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT / "migration-state"
LOG_DIR = ROOT / "migration-logs"
TEMP_DIR = ROOT / "migration-temp"

for d in (STATE_DIR, LOG_DIR, TEMP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def log(message):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] {message}"
    print(line)

    with open(LOG_DIR / "mac-migrator.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_source_sql(sql):
    if not os.environ.get("FUN_JWT"):
        raise RuntimeError("FUN_JWT is not set")

    proc = subprocess.run(
        ["bash", "scripts/fun-sql.sh", sql],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )

    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "fun-sql.sh failed")

    result = json.loads(proc.stdout)

    if result.get("ok") is not True:
        raise RuntimeError(
            f"{result.get('error')} - {result.get('message')}"
        )

    return result


def run_target_psql(args, input_text=None):
    target = os.environ.get("TARGET")
    if not target:
        raise RuntimeError("TARGET is not set")

    proc = subprocess.run(
        ["psql", target, "-X", "-v", "ON_ERROR_STOP=1", *args],
        cwd=ROOT,
        text=True,
        input=input_text,
        capture_output=True,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            proc.stderr.strip() or proc.stdout.strip()
        )

    return proc.stdout


def canonicalize(rows, pk):
    return sorted(rows, key=lambda r: str(r[pk]))


def canonical_hash(rows, pk):
    rows = canonicalize(rows, pk)

    blob = json.dumps(
        rows,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(blob).hexdigest()


def fetch_source(table, batch_size):
    cfg = TABLES[table]
    pk = cfg["pk"]
    columns = cfg["columns"]

    qcols = ", ".join(f'"{c}"' for c in columns)

    sql = f"""
select {qcols}
from public."{table}"
order by "{pk}" asc
limit {int(batch_size)}
""".strip()

    result = run_source_sql(sql)
    return result.get("rows", []), result.get("ms")


def target_count(table):
    out = run_target_psql([
        "-At",
        "-c",
        f'SELECT count(*) FROM public."{table}";'
    ])

    return int(out.strip())


def write_csv(table, rows):
    cfg = TABLES[table]
    columns = cfg["columns"]

    path = TEMP_DIR / f"{table}-apply.csv"

    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(columns)

        for r in rows:
            row = []
            for c in columns:
                v = r.get(c)

                if v is None:
                    row.append(r"\N")
                elif isinstance(v, bool):
                    row.append("true" if v else "false")
                elif isinstance(v, (dict, list)):
                    row.append(
                        json.dumps(
                            v,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                    )
                else:
                    row.append(str(v))

            w.writerow(row)

    os.chmod(path, 0o600)
    return path


def apply_table(table, batch_size):
    if table != "i18n_languages":
        raise RuntimeError(
            "APPLY safety lock: only i18n_languages is allowed"
        )

    cfg = TABLES[table]
    pk = cfg["pk"]
    columns = cfg["columns"]

    log(f"APPLY start table={table}")

    source_rows, source_ms = fetch_source(table, batch_size)

    if len(source_rows) != 13:
        raise RuntimeError(
            f"Expected 13 source rows, got {len(source_rows)}"
        )

    source_hash = canonical_hash(source_rows, pk)

    before = target_count(table)

    if before != 0:
        raise RuntimeError(
            f"Target preflight failed: expected 0 rows, got {before}"
        )

    csv_path = write_csv(table, source_rows)

    column_list = ",".join(f'"{c}"' for c in columns)

    sql = f"""
BEGIN;

\\copy public."{table}" ({column_list}) FROM '{csv_path}' WITH (FORMAT csv, HEADER true, NULL '\\N')

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM public."{table}";

  IF v_count <> 13 THEN
    RAISE EXCEPTION
      'Target count mismatch before commit: expected 13, got %',
      v_count;
  END IF;
END
$$;

COMMIT;
"""

    run_target_psql([], input_text=sql)

    after = target_count(table)

    if after != 13:
        raise RuntimeError(
            f"Post-commit count mismatch: expected 13, got {after}"
        )

    qcols = ", ".join(f'"{c}"' for c in columns)

    target_json_sql = f"""
select coalesce(
  json_agg(t order by "{pk}"),
  '[]'::json
)::text
from (
  select {qcols}
  from public."{table}"
) t;
"""

    target_json = run_target_psql([
        "-At",
        "-c",
        target_json_sql,
    ]).strip()

    target_rows = json.loads(target_json)
    target_hash = canonical_hash(target_rows, pk)

    if source_hash != target_hash:
        raise RuntimeError(
            "HASH MISMATCH after commit: source != target"
        )

    state = {
        "table": table,
        "status": "verified",
        "rows": 13,
        "source_sha256": source_hash,
        "target_sha256": target_hash,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    state_path = STATE_DIR / f"{table}.json"

    state_path.write_text(
        json.dumps(state, indent=2),
        encoding="utf-8"
    )

    os.chmod(state_path, 0o600)

    print()
    print("=== MAC MIGRATOR APPLY SUCCESS ===")
    print("TABLE:", table)
    print("SOURCE ROWS:", len(source_rows))
    print("TARGET ROWS:", after)
    print("SOURCE SHA256:", source_hash)
    print("TARGET SHA256:", target_hash)
    print("HASH MATCH:", source_hash == target_hash)
    print("SOURCE MS:", source_ms)
    print("STATE FILE:", state_path)
    print("==================================")

    log(
        f"APPLY success table={table} rows=13 "
        f"hash_match=true"
    )


def dry_run(table, batch_size):
    cfg = TABLES[table]
    pk = cfg["pk"]

    rows, source_ms = fetch_source(table, batch_size)
    digest = canonical_hash(rows, pk)

    print()
    print("=== MAC MIGRATOR DRY RUN ===")
    print("TABLE:", table)
    print("ROWS FETCHED:", len(rows))

    if rows:
        print("FIRST PK:", rows[0][pk])
        print("LAST PK:", rows[-1][pk])

    print("SHA256:", digest)
    print("SOURCE MS:", source_ms)
    print("TARGET WRITES: 0")
    print("============================")


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--table",
        required=True,
        choices=sorted(TABLES.keys()),
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
    )

    mode = parser.add_mutually_exclusive_group(required=True)

    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")

    args = parser.parse_args()

    if args.batch_size < 1 or args.batch_size > 1000:
        print("ERROR: invalid batch size", file=sys.stderr)
        sys.exit(2)

    try:
        if args.dry_run:
            dry_run(args.table, args.batch_size)
        else:
            apply_table(args.table, args.batch_size)

    except Exception as e:
        log(f"ERROR: {e}")
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
