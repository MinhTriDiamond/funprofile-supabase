#!/usr/bin/env python3

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_FILE = ROOT / "migration-snapshot/28-migration-manifest.json"
STATE_DIR = ROOT / "migration-state"
OUT_FILE = ROOT / "migration-snapshot/29-small-batch-plan.json"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


manifest = load_json(MANIFEST_FILE)
tables = manifest["tables"]

table_map = {
    t["table_name"]: t
    for t in tables
}


# --------------------------------------------------
# Verified tables
# --------------------------------------------------

verified = set()

for p in STATE_DIR.glob("*.json"):
    try:
        d = load_json(p)

        if (
            d.get("status") == "verified"
            and d.get("table")
        ):
            verified.add(d["table"])

    except Exception:
        pass


# --------------------------------------------------
# Empty source tables
# These satisfy FK dependencies without migration.
# --------------------------------------------------

empty_tables = {
    t["table_name"]
    for t in tables
    if int(t["row_count"]) == 0
}


# --------------------------------------------------
# Eligible SMALL normal-copy tables
# --------------------------------------------------

eligible = {}

deferred = {}

for t in tables:
    name = t["table_name"]
    reasons = []

    if t["tier"] != "SMALL":
        reasons.append("not-small")

    if t["policy"] != "COPY":
        reasons.append(f"policy={t['policy']}")

    if len(t["primary_key"]["columns"]) != 1:
        reasons.append("composite-pk")

    if t["requires_cycle_handling"]:
        reasons.append("cycle-handling")

    if name in verified:
        reasons.append("already-verified")

    if reasons:
        deferred[name] = reasons
    else:
        eligible[name] = t


# --------------------------------------------------
# Build dependency waves.
#
# A dependency is satisfied when:
# - already verified
# - source parent is empty
# - migrated in an earlier wave
# --------------------------------------------------

satisfied = set(verified) | set(empty_tables)

remaining = set(eligible)
waves = []

while remaining:
    ready = []

    for name in remaining:
        t = eligible[name]

        unsatisfied = [
            dep
            for dep in t["active_dependencies"]
            if dep not in satisfied
        ]

        if not unsatisfied:
            ready.append(name)

    if not ready:
        break

    ready.sort(
        key=lambda name:
            eligible[name]["import_order"]
    )

    wave = []

    for name in ready:
        t = eligible[name]

        wave.append({
            "table_name": name,
            "import_order": t["import_order"],
            "row_count": int(t["row_count"]),
            "count_type": t["count_type"],
            "tier": t["tier"],
            "pk": t["primary_key"]["columns"][0],
            "trigger_count": t["trigger_count"],
            "dependencies": t["active_dependencies"],
        })

    waves.append(wave)

    for name in ready:
        satisfied.add(name)
        remaining.remove(name)


# --------------------------------------------------
# Explain blocked tables
# --------------------------------------------------

blocked = []

for name in sorted(
    remaining,
    key=lambda n: eligible[n]["import_order"]
):
    t = eligible[name]

    unsatisfied = [
        dep
        for dep in t["active_dependencies"]
        if dep not in satisfied
    ]

    blocked.append({
        "table_name": name,
        "import_order": t["import_order"],
        "row_count": int(t["row_count"]),
        "unsatisfied_dependencies": unsatisfied,
    })


# --------------------------------------------------
# Totals
# --------------------------------------------------

planned_tables = sum(
    len(w)
    for w in waves
)

planned_rows = sum(
    item["row_count"]
    for wave in waves
    for item in wave
)

plan = {
    "version": "4.4-plan-v1",
    "verified_tables": sorted(verified),
    "verified_count": len(verified),
    "empty_source_tables": sorted(empty_tables),
    "eligible_small_tables": len(eligible),
    "wave_count": len(waves),
    "planned_tables": planned_tables,
    "planned_rows_snapshot": planned_rows,
    "blocked_tables": blocked,
    "waves": waves,
}

OUT_FILE.write_text(
    json.dumps(
        plan,
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)


print("=== SMALL BATCH PLAN ===")
print("VERIFIED:", len(verified))
print("EMPTY SOURCE TABLES:", len(empty_tables))
print("ELIGIBLE SMALL:", len(eligible))
print("WAVES:", len(waves))
print("PLANNED TABLES:", planned_tables)
print("BLOCKED:", len(blocked))
print("SNAPSHOT ROWS IN PLAN:", planned_rows)
print("OUTPUT:", OUT_FILE)

print("\nWAVE SUMMARY:")

for i, wave in enumerate(waves, start=1):
    rows = sum(
        item["row_count"]
        for item in wave
    )

    with_triggers = sum(
        item["trigger_count"] > 0
        for item in wave
    )

    print(
        f" - Wave {i}: "
        f"{len(wave)} tables / "
        f"{rows} rows / "
        f"{with_triggers} tables with triggers"
    )


print("\nFIRST WAVE:")

if waves:
    for item in waves[0]:
        print(
            f"{item['import_order']:>3}  "
            f"{item['row_count']:>8} rows  "
            f"{item['table_name']}"
        )


print("\nBLOCKED TABLES:")

if not blocked:
    print(" - none")
else:
    for item in blocked:
        print(
            f" - {item['table_name']}: "
            + ", ".join(
                item["unsatisfied_dependencies"]
            )
        )
