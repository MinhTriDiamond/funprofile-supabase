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
    "sticker_packs": {
        "pk": "id",
        "expected_rows": 1,
        "depends_on": [],
        "columns": [
            "id",
            "name",
            "description",
            "preview_url",
            "is_free",
            "is_active",
            "sort_order",
            "created_at",
        ],
    },

    "stickers": {
        "pk": "id",
        "expected_rows": 6,
        "depends_on": ["sticker_packs"],
        "columns": [
            "id",
            "pack_id",
            "name",
            "url",
            "sort_order",
            "is_animated",
            "created_at",
        ],
    },
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

    with open(
        LOG_DIR / "mac-migrator-v3.log",
        "a",
        encoding="utf-8",
    ) as f:
        f.write(line + "\n")


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
            proc.stderr.strip() or "fun-sql.sh failed"
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


def canonical_rows(rows, pk):
    return sorted(
        rows,
        key=lambda r: str(r[pk]),
    )


def canonical_hash(rows, pk):
    rows = canonical_rows(rows, pk)

    payload = json.dumps(
        rows,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(payload).hexdigest()


def fetch_source(table):
    cfg = TABLES[table]

    columns = cfg["columns"]
    pk = cfg["pk"]
    expected = cfg["expected_rows"]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    # Test tables are tiny.
    # Hard limit prevents accidental large-table fetch.
    limit = min(max(expected + 10, 50), 1000)

    sql = f"""
select {qcols}
from public."{table}"
order by "{pk}" asc
limit {limit}
""".strip()

    result = run_source_sql(sql)

    rows = result.get("rows", [])

    if len(rows) != expected:
        raise RuntimeError(
            f"{table}: expected {expected} source rows, "
            f"got {len(rows)}"
        )

    return rows, result.get("ms")


def target_count(table):
    out = run_target_psql([
        "-At",
        "-c",
        f'SELECT count(*) FROM public."{table}";',
    ])

    return int(out.strip())


def verify_dependencies(table):
    cfg = TABLES[table]

    for parent in cfg["depends_on"]:
        expected = TABLES[parent]["expected_rows"]
        actual = target_count(parent)

        if actual != expected:
            raise RuntimeError(
                f"Dependency not ready: {parent} "
                f"expected={expected} target={actual}"
            )

        state_path = STATE_DIR / f"{parent}.json"

        if not state_path.exists():
            raise RuntimeError(
                f"Dependency checkpoint missing: {state_path}"
            )

        state = json.loads(
            state_path.read_text(encoding="utf-8")
        )

        if state.get("status") != "verified":
            raise RuntimeError(
                f"Dependency not verified: {parent}"
            )


def write_csv(table, rows):
    cfg = TABLES[table]
    columns = cfg["columns"]

    path = TEMP_DIR / f"{table}-v3.csv"

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
    cfg = TABLES[table]

    columns = cfg["columns"]
    pk = cfg["pk"]

    qcols = ", ".join(
        f'"{c}"'
        for c in columns
    )

    sql = f"""
select coalesce(
  json_agg(t order by "{pk}"),
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


def verify_stickers_fk():
    sql = """
select count(*)
from public.stickers s
left join public.sticker_packs p
  on p.id = s.pack_id
where p.id is null;
""".strip()

    out = run_target_psql([
        "-At",
        "-c",
        sql,
    ])

    orphan_count = int(out.strip())

    if orphan_count != 0:
        raise RuntimeError(
            f"FK verification failed: "
            f"{orphan_count} orphan stickers"
        )

    return orphan_count


def save_state(
    table,
    row_count,
    source_hash,
    target_hash,
):
    state = {
        "table": table,
        "status": "verified",
        "rows": row_count,
        "source_sha256": source_hash,
        "target_sha256": target_hash,
        "completed_at": (
            datetime.now(timezone.utc).isoformat()
        ),
    }

    path = STATE_DIR / f"{table}.json"

    path.write_text(
        json.dumps(
            state,
            indent=2,
        ),
        encoding="utf-8",
    )

    os.chmod(path, 0o600)

    return path


def dry_run(table):
    cfg = TABLES[table]
    pk = cfg["pk"]

    rows, source_ms = fetch_source(table)

    digest = canonical_hash(rows, pk)

    print()
    print("=== MAC MIGRATOR V3 DRY RUN ===")
    print("TABLE:", table)
    print("SOURCE ROWS:", len(rows))
    print("SOURCE SHA256:", digest)
    print("SOURCE MS:", source_ms)
    print("TARGET WRITES: 0")
    print("===============================")


def apply_table(table):
    cfg = TABLES[table]

    expected = cfg["expected_rows"]
    pk = cfg["pk"]
    columns = cfg["columns"]

    log(f"APPLY start table={table}")

    verify_dependencies(table)

    before = target_count(table)

    if before != 0:
        raise RuntimeError(
            f"{table}: target preflight expected 0 rows, "
            f"got {before}"
        )

    source_rows, source_ms = fetch_source(table)

    source_hash = canonical_hash(
        source_rows,
        pk,
    )

    csv_path = write_csv(
        table,
        source_rows,
    )

    column_list = ",".join(
        f'"{c}"'
        for c in columns
    )

    # IMPORTANT:
    # psql \copy must be entirely on one physical line.
    copy_line = (
        f'\\copy public."{table}" '
        f'({column_list}) '
        f"FROM '{csv_path}' "
        f"WITH (FORMAT csv, HEADER true, NULL '\\N')"
    )

    sql = f"""
BEGIN;

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

    target_rows = fetch_target_rows(table)

    target_hash = canonical_hash(
        target_rows,
        pk,
    )

    if source_hash != target_hash:
        raise RuntimeError(
            f"{table}: HASH MISMATCH"
        )

    orphan_count = None

    if table == "stickers":
        orphan_count = verify_stickers_fk()

    state_path = save_state(
        table,
        expected,
        source_hash,
        target_hash,
    )

    print()
    print("=== MAC MIGRATOR V3 APPLY SUCCESS ===")
    print("TABLE:", table)
    print("SOURCE ROWS:", len(source_rows))
    print("TARGET ROWS:", after)
    print("SOURCE SHA256:", source_hash)
    print("TARGET SHA256:", target_hash)
    print("HASH MATCH:", source_hash == target_hash)

    if orphan_count is not None:
        print("FK ORPHANS:", orphan_count)

    print("SOURCE MS:", source_ms)
    print("STATE FILE:", state_path)
    print("=====================================")

    log(
        f"APPLY success table={table} "
        f"rows={expected} "
        f"hash_match=true"
    )


def main():
    parser = argparse.ArgumentParser(
        description="FUN Profile Mac Migrator v3"
    )

    parser.add_argument(
        "--table",
        required=True,
        choices=sorted(TABLES.keys()),
    )

    mode = parser.add_mutually_exclusive_group(
        required=True
    )

    mode.add_argument(
        "--dry-run",
        action="store_true",
    )

    mode.add_argument(
        "--apply",
        action="store_true",
    )

    args = parser.parse_args()

    try:
        if args.dry_run:
            dry_run(args.table)
        else:
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
