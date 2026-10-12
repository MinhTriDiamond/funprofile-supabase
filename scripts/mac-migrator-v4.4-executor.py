#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

PLAN_FILE = ROOT / "migration-snapshot/29-small-batch-plan.json"
MANIFEST_FILE = ROOT / "migration-snapshot/28-migration-manifest.json"
STATE_DIR = ROOT / "migration-state"

MIGRATOR = ROOT / "scripts/mac-migrator-v4.3.py"


SAFE_CUTOFF_TABLES = {
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
    "pplp_v25_stability_index",
    "profiles_wallet_audit",
    "search_history",
    "wallet_reconciliation_runs",    "admin_backfill_candidates",    "conversation_participants",    "identity_events",    "reward_vesting_schedules",    "account_activity_logs",    "light_reputation",    "login_ip_logs",    "profile_btc_aux_addresses",    "quest_user_progress",    "soul_nfts",    "wallet_transfers",    "reel_views",    "posts",    "post_tags",    "shared_posts",    "video_downloads",    "message_reads",    "mint_allocations",    "chunked_recordings",    "creator_library",    "live_messages",    "live_reactions",    "external_tx_filter_log",    "pet_interactions",    "pplp_v25_vvu_log",    "scanner_block_gaps",    "scanner_tick_log",    "transactions",    "identity_epoch_snapshots",    "wallet_reconciliation_findings",
}



SPECIAL_SINGLE_STATEMENT_TABLES = {
    "dib_profile",
    "trust_profile",
}

DEFER_NO_CUTOFF = {
    # Special mutable/security-sensitive tables.
    "pplp_device_registry",
    "user_roles",
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


plan = load_json(PLAN_FILE)
manifest = load_json(MANIFEST_FILE)

table_map = {
    t["table_name"]: t
    for t in manifest["tables"]
}


def verified_tables():
    result = set()

    for p in STATE_DIR.glob("*.json"):
        try:
            d = load_json(p)

            if (
                d.get("status") == "verified"
                and d.get("table")
            ):
                result.add(d["table"])

        except Exception:
            pass

    return result


def dependency_status(table, verified):
    meta = table_map[table]

    missing = []

    for dep in meta["active_dependencies"]:
        dep_meta = table_map[dep]

        if dep in verified:
            continue

        if int(dep_meta["row_count"]) == 0:
            continue

        missing.append(dep)

    return missing


def classify(table):
    meta = table_map[table]
    rows = int(meta["row_count"])

    if rows == 0:
        return "EMPTY"

    if table in SPECIAL_SINGLE_STATEMENT_TABLES:
        return "LANE_A"

    if rows <= 1000:
        return "LANE_A"

    if table in SAFE_CUTOFF_TABLES:
        return "LANE_B"

    if table in DEFER_NO_CUTOFF:
        return "DEFER"

    return "BLOCKED"


def run_migrator(table):
    env = os.environ.copy()

    # Explicit authorization for batch executor.
    env["MIGRATOR_BATCH_AUTHORIZED"] = "1"

    proc = subprocess.run(
        [
            sys.executable,
            str(MIGRATOR),
            "--table",
            table,
            "--apply",
        ],
        cwd=ROOT,
        env=env,
    )

    return proc.returncode


def main():
    parser = argparse.ArgumentParser(
        description="FUN Profile Mac Migrator v4.4 batch executor"
    )

    parser.add_argument(
        "--wave",
        type=int,
        default=1,
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=3,
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
    )

    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help=(
            "Comma-separated table names to include. "
            "Filtering happens after normal safety/dependency checks."
        ),
    )

    args = parser.parse_args()

    only_tables = None
    if args.only:
        only_tables = {
            name.strip()
            for name in args.only.split(",")
            if name.strip()
        }

    if args.wave < 1 or args.wave > len(plan["waves"]):
        raise SystemExit("ERROR: invalid wave")

    wave = plan["waves"][args.wave - 1]

    verified = verified_tables()

    candidates = []

    print(f"=== WAVE {args.wave} EXECUTOR PLAN ===")
    print("VERIFIED:", len(verified))

    for item in wave:
        table = item["table_name"]

        if only_tables is not None and table not in only_tables:
            continue

        if table in verified:
            continue

        lane = classify(table)

        if lane == "DEFER":
            print(
                f"DEFER  {table}: "
                f">1000 rows and no safe cutoff"
            )
            continue

        if lane == "BLOCKED":
            print(
                f"BLOCK  {table}: "
                f"not approved for automatic migration"
            )
            continue

        missing = dependency_status(
            table,
            verified,
        )

        if missing:
            print(
                f"WAIT   {table}: "
                + ", ".join(missing)
            )
            continue

        candidates.append(
            (table, lane, int(item["row_count"]))
        )

    if only_tables is not None:
        wave_tables = {
            item["table_name"]
            for item in wave
        }

        unknown = sorted(only_tables - wave_tables)

        if unknown:
            raise SystemExit(
                "ERROR: --only table(s) not in selected wave: "
                + ", ".join(unknown)
            )

    print()
    print("RUNNABLE NOW:", len(candidates))
    print("LIMIT:", args.limit)

    selected = candidates[:args.limit]

    print("\nSELECTED:")

    for table, lane, rows in selected:
        print(
            f" - {table}: "
            f"{lane} / snapshot_rows={rows}"
        )

    if args.dry_run:
        print("\nDRY RUN ONLY — NO TARGET WRITES")
        return

    if not selected:
        print("\nNothing to run.")
        return

    print("\n=== EXECUTION START ===")

    for index, (table, lane, rows) in enumerate(
        selected,
        start=1,
    ):
        print()
        print(
            f"[{index}/{len(selected)}] "
            f"{table} ({lane})"
        )

        rc = run_migrator(table)

        if rc != 0:
            raise SystemExit(
                f"\nSTOP: migration failed for {table}"
            )

        verified.add(table)

        print(
            f"PASS: {table}"
        )

    print()
    print("=== BATCH COMPLETE ===")
    print("MIGRATED:", len(selected))


if __name__ == "__main__":
    main()
