#!/usr/bin/env python3

import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / "migration-snapshot"
STATE = ROOT / "migration-state"

ORDER_FILE = SNAP / "23-public-import-order.txt"
COLUMNS_FILE = SNAP / "04a-table-columns.json"
CONSTRAINTS_FILE = SNAP / "05-constraints.json"
TRIGGERS_FILE = SNAP / "13-triggers.json"
FKS_FILE = SNAP / "21-public-fks.json"
COUNTS_FILE = SNAP / "25-public-row-counts-merged.json"
SIZES_FILE = SNAP / "26-public-table-sizes.json"
TIER_FILE = SNAP / "27-public-data-manifest.json"

OUT_FILE = SNAP / "28-migration-manifest.json"


# ---------------------------------------------------------
# Tables intentionally excluded from the clean baseline
# ---------------------------------------------------------

EXCLUDED_TABLES = {
    "_backup_btc_p0_fix_20260713",
    "btc_aux_cleanup_audit_20260621",
    "btc_aux_misattribution_audit_20260612",
    "btc_donations_wrong_father_backup_20260621",
    "btc_father_aux_full_backup_20260621",
    "btc_father_backfill_audit_20260621",
    "btc_full_reconcile_audit_20260621",
    "btc_transactions_orphan_backup_20260621",
    "btc_wallet_transfers_orphan_backup_20260621",
    "donations_spam_backup_20260705",
    "profiles_wallet_backup_20260601",
}


# ---------------------------------------------------------
# FK constraints temporarily handled for cycle breaking
# ---------------------------------------------------------

CYCLE_BREAK_FKS = {
    "profiles_current_live_session_id_fkey",
    "profiles_pinned_post_id_fkey",
    "comments_parent_comment_id_fkey",
    "messages_reply_to_id_fkey",
    "pplp_mint_requests_parent_request_id_fkey",
    "reel_comments_parent_comment_id_fkey",
}


# ---------------------------------------------------------
# Sensitive / operational migration policy
# ---------------------------------------------------------

SPECIAL_POLICY = {
    "app_secrets": {
        "policy": "REBUILD_TARGET",
        "reason": "Do not migrate source secrets",
    },
    "app_secrets_audit": {
        "policy": "SKIP",
        "reason": "Source audit table is empty",
    },
    "connector_config": {
        "policy": "COPY",
        "reason": "Business configuration; no direct secret fields identified",
    },
    "connector_links": {
        "policy": "COPY",
        "reason": "Business linkage table; currently empty",
    },
    "connector_windows": {
        "policy": "SKIP_EPHEMERAL",
        "reason": "Operational windows with expiration/status state",
    },
    "oauth_clients": {
        "policy": "SPECIAL_ROTATE",
        "reason": "Preserve metadata but rotate client_secret and review URLs",
    },
    "oauth_codes": {
        "policy": "SKIP_EPHEMERAL",
        "reason": "Short-lived OAuth authorization codes",
    },
    "rtmp_stream_configs": {
        "policy": "REBUILD_ROTATE",
        "reason": "External Cloudflare resources and encrypted stream keys",
    },
}


def load_rows(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("rows", [])


def parse_constraint_columns(definition, prefix):
    """
    Parse common forms such as:
      PRIMARY KEY (id)
      PRIMARY KEY (user_id, token)
    """
    if not definition.startswith(prefix):
        return []

    m = re.search(r"\((.*)\)", definition)

    if not m:
        return []

    inner = m.group(1)

    cols = []

    for raw in inner.split(","):
        col = raw.strip()

        if col.startswith('"') and col.endswith('"'):
            col = col[1:-1].replace('""', '"')

        cols.append(col)

    return cols


order = [
    x.strip()
    for x in ORDER_FILE.read_text(encoding="utf-8").splitlines()
    if x.strip()
]

if len(order) != 275:
    raise SystemExit(
        f"ERROR: expected 275 tables in import order, got {len(order)}"
    )

if len(set(order)) != len(order):
    raise SystemExit("ERROR: duplicate table in import order")


columns_rows = load_rows(COLUMNS_FILE)
constraint_rows = load_rows(CONSTRAINTS_FILE)
trigger_rows = load_rows(TRIGGERS_FILE)
fk_rows = load_rows(FKS_FILE)
count_rows = load_rows(COUNTS_FILE)
size_rows = load_rows(SIZES_FILE)
tier_rows = load_rows(TIER_FILE)


columns_by_table = defaultdict(list)

for r in columns_rows:
    table = r["table_name"]

    if table not in order:
        continue

    columns_by_table[table].append(r)

for table in columns_by_table:
    columns_by_table[table].sort(
        key=lambda r: int(r["ordinal_position"])
    )


pk_by_table = {}
unique_constraints_by_table = defaultdict(list)
constraints_by_table = defaultdict(list)

for r in constraint_rows:
    table = r["table_name"]

    if table not in order:
        continue

    constraints_by_table[table].append(r)

    ctype = r["constraint_type"]
    definition = r["definition"]

    if ctype == "p":
        pk_by_table[table] = {
            "constraint_name": r["constraint_name"],
            "columns": parse_constraint_columns(
                definition,
                "PRIMARY KEY",
            ),
            "definition": definition,
        }

    elif ctype == "u":
        unique_constraints_by_table[table].append({
            "constraint_name": r["constraint_name"],
            "columns": parse_constraint_columns(
                definition,
                "UNIQUE",
            ),
            "definition": definition,
        })


triggers_by_table = defaultdict(list)

for r in trigger_rows:
    table = r["table_name"]

    if table not in order:
        continue

    triggers_by_table[table].append({
        "trigger_name": r["trigger_name"],
        "definition": r["definition"],
        "function_signature": r["function_signature"],
    })


original_dependencies = defaultdict(set)
active_dependencies = defaultdict(set)
fk_details_by_table = defaultdict(list)

for r in fk_rows:
    child = r["child_table"]
    parent = r["parent_table"]
    name = r["constraint_name"]

    if child not in order or parent not in order:
        continue

    original_dependencies[child].add(parent)

    cycle_break = name in CYCLE_BREAK_FKS

    if not cycle_break:
        active_dependencies[child].add(parent)

    fk_details_by_table[child].append({
        "constraint_name": name,
        "parent_table": parent,
        "definition": r["definition"],
        "cycle_break": cycle_break,
    })


count_map = {
    r["table_name"]: r
    for r in count_rows
}

size_map = {
    r["table_name"]: r
    for r in size_rows
    if r["table_name"] in order
}

tier_map = {
    r["table_name"]: r
    for r in tier_rows
}


def migration_state(table):
    p = STATE / f"{table}.json"

    if not p.exists():
        return None

    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {
            "status": "invalid_state_file"
        }


manifest_tables = []

for import_index, table in enumerate(order, start=1):
    cols = columns_by_table.get(table, [])

    if not cols:
        raise SystemExit(
            f"ERROR: no column metadata for {table}"
        )

    all_columns = [
        r["column_name"]
        for r in cols
    ]

    generated_columns = [
        r["column_name"]
        for r in cols
        if r.get("is_generated") not in (None, "NEVER")
    ]

    identity_columns = [
        {
            "column_name": r["column_name"],
            "generation": r.get("identity_generation"),
        }
        for r in cols
        if str(r.get("is_identity", "")).upper() == "YES"
    ]

    # Generated columns must not be included in normal COPY.
    writable_columns = [
        r["column_name"]
        for r in cols
        if r["column_name"] not in generated_columns
    ]

    count = count_map.get(table)

    if count is None:
        raise SystemExit(
            f"ERROR: missing row-count metadata for {table}"
        )

    size = size_map.get(table)

    if size is None:
        raise SystemExit(
            f"ERROR: missing size metadata for {table}"
        )

    tier_info = tier_map.get(table)

    if tier_info is None:
        raise SystemExit(
            f"ERROR: missing tier metadata for {table}"
        )

    row_count = int(count["row_count"])
    count_type = count["count_type"]

    if table in SPECIAL_POLICY:
        policy = SPECIAL_POLICY[table]["policy"]
        policy_reason = SPECIAL_POLICY[table]["reason"]

    elif row_count == 0:
        policy = "SKIP_EMPTY"
        policy_reason = "Source table has zero rows"

    elif table == "live_session_events":
        policy = "MIGRATE_GIANT_LAST"
        policy_reason = (
            "Large event history table; migrate separately "
            "with resumable PK-range/cursor pipeline"
        )

    else:
        policy = "COPY"
        policy_reason = "Normal business data migration"

    cycle_constraints = sorted(
        x["constraint_name"]
        for x in fk_details_by_table.get(table, [])
        if x["cycle_break"]
    )

    state = migration_state(table)

    manifest_tables.append({
        "table_name": table,
        "import_order": import_index,

        "all_columns": all_columns,
        "writable_columns": writable_columns,
        "generated_columns": generated_columns,
        "identity_columns": identity_columns,

        "primary_key": pk_by_table.get(table),
        "unique_constraints": unique_constraints_by_table.get(
            table,
            [],
        ),

        "dependencies": sorted(
            original_dependencies.get(table, set())
        ),
        "active_dependencies": sorted(
            active_dependencies.get(table, set())
        ),
        "foreign_keys": sorted(
            fk_details_by_table.get(table, []),
            key=lambda x: x["constraint_name"],
        ),

        "cycle_break_constraints": cycle_constraints,
        "requires_cycle_handling": bool(cycle_constraints),

        "trigger_count": len(
            triggers_by_table.get(table, [])
        ),
        "triggers": sorted(
            triggers_by_table.get(table, []),
            key=lambda x: x["trigger_name"],
        ),

        "row_count": row_count,
        "count_type": count_type,

        "table_bytes": int(size["table_bytes"]),
        "index_bytes": int(size["index_bytes"]),
        "total_bytes": int(size["total_bytes"]),

        "tier": tier_info["tier"],

        "policy": policy,
        "policy_reason": policy_reason,

        "existing_migration_state": state,
    })


manifest = {
    "version": 1,
    "baseline_table_count": len(manifest_tables),
    "cycle_break_constraints": sorted(CYCLE_BREAK_FKS),
    "tables": manifest_tables,
}

OUT_FILE.write_text(
    json.dumps(
        manifest,
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)


# ---------------------------------------------------------
# Validation / summary
# ---------------------------------------------------------

policies = defaultdict(int)
tiers = defaultdict(int)

tables_without_pk = []
generated_tables = []
identity_tables = []
trigger_tables = []
cycle_tables = []
already_verified = []

for t in manifest_tables:
    policies[t["policy"]] += 1
    tiers[t["tier"]] += 1

    if not t["primary_key"]:
        tables_without_pk.append(t["table_name"])

    if t["generated_columns"]:
        generated_tables.append(t["table_name"])

    if t["identity_columns"]:
        identity_tables.append(t["table_name"])

    if t["trigger_count"]:
        trigger_tables.append(t["table_name"])

    if t["requires_cycle_handling"]:
        cycle_tables.append(t["table_name"])

    state = t["existing_migration_state"] or {}

    if state.get("status") == "verified":
        already_verified.append(t["table_name"])


print("MANIFEST TABLES:", len(manifest_tables))
print("UNIQUE TABLES:", len({
    t["table_name"]
    for t in manifest_tables
}))
print("OUTPUT:", OUT_FILE)

print("\nTIERS:")
for k in ["GIANT", "LARGE", "MEDIUM", "SMALL"]:
    print(f" - {k}: {tiers[k]}")

print("\nPOLICIES:")
for k in sorted(policies):
    print(f" - {k}: {policies[k]}")

print()
print("TABLES WITHOUT PK:", len(tables_without_pk))
print("TABLES WITH GENERATED COLUMNS:", len(generated_tables))
print("TABLES WITH IDENTITY COLUMNS:", len(identity_tables))
print("TABLES WITH APP TRIGGERS:", len(trigger_tables))
print("TABLES REQUIRING CYCLE HANDLING:", len(cycle_tables))
print("ALREADY VERIFIED BY MAC MIGRATOR:", len(already_verified))

print("\nALREADY VERIFIED:")
for t in already_verified:
    print(" -", t)

print("\nCYCLE-HANDLING TABLES:")
for t in cycle_tables:
    print(" -", t)

print("\nTABLES WITHOUT PRIMARY KEY:")
for t in tables_without_pk:
    print(" -", t)
