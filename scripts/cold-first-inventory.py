#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import runpy
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = runpy.run_path(str(ROOT / "scripts/post-copy-reconcile.py"), run_name="cold_inventory_runtime")
OUT = ROOT / "migration-state/reconcile"
HOT_SEEDS = {"posts", "live_sessions"}


def qi(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def pk_columns(row: dict) -> list[str]:
    return list(row["primary_key"]["columns"])


def fk_shape(fk: dict) -> tuple[list[str], str, list[str]] | None:
    match = re.search(r"FOREIGN KEY \(([^)]+)\) REFERENCES (?:public\.)?([^ (]+)\(([^)]+)\)", fk["definition"])
    if not match:
        return None
    clean = lambda text: [part.strip().strip('"') for part in text.split(",")]
    return clean(match.group(1)), fk["parent_table"], clean(match.group(3))


def summary_sql(rows: list[dict]) -> str:
    selects = []
    for row in rows:
        table = row["table_name"]
        pk = pk_columns(row)
        if row["tier"] in {"LARGE", "GIANT"}:
            selects.append(f"select '{table}'::text table_name,count(*)::bigint n,null::text fp from public.{qi(table)}")
            continue
        payload = ",".join(f"{qi(column)}::text" for column in pk)
        ordered = ",".join(qi(column) for column in pk)
        selects.append(
            f"select '{table}'::text table_name,count(*)::bigint n,"
            f"md5(coalesce(string_agg(to_jsonb(array[{payload}])::text,E'\\n' order by {ordered}),'')) fp "
            f"from public.{qi(table)}"
        )
    return " union all ".join(selects)


def topological(names: set[str], parents: dict[str, set[str]]) -> list[str]:
    indegree = {name: 0 for name in names}
    children: dict[str, set[str]] = defaultdict(set)
    for child in names:
        for parent in parents[child] & names:
            indegree[child] += 1
            children[parent].add(child)
    queue = deque(sorted(name for name, degree in indegree.items() if degree == 0))
    result = []
    while queue:
        name = queue.popleft(); result.append(name)
        for child in sorted(children[name]):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    return result + sorted(names - set(result))


DIAG: dict = {"entries": []}


def _diag_write(status: str) -> None:
    """Write safe diagnostic metadata only: phase, batch, table names, stage,
    exception class. Never SQL text, row data, keys, or credentials."""
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = OUT / f"{stamp}-inventory-diagnostics.json"
        payload = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "entries": DIAG["entries"],
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        os.chmod(path, 0o600)
    except Exception:
        pass


def _diag_failed(entry: dict, exc: BaseException) -> None:
    entry["result"] = "failed"
    entry["exit_class"] = type(exc).__name__
    DIAG["entries"].append(entry)
    _diag_write("FAILED")


def main() -> int:
    entry = {"phase": "preflight", "stage": "jwt"}
    try:
        ttl = R["require_fresh_jwt"]()
        entry["stage"] = "manifest"
        manifest = json.loads((ROOT / "migration-snapshot/28-migration-manifest.json").read_text())["tables"]
    except BaseException as exc:
        _diag_failed(entry, exc)
        raise
    entry["result"] = "ok"
    DIAG["entries"].append(entry)
    source_rows = []
    target_rows = []
    for start in range(0, len(manifest), 5):
        batch = manifest[start:start + 5]
        entry = {
            "phase": "summary",
            "batch_index": start // 5,
            "tables": [row["table_name"] for row in batch],
            "stage": "source",
        }
        try:
            query = summary_sql(batch)
            source_rows.extend(R["run_source_sql"](query)["rows"])
            entry["stage"] = "target"
            target_payload = R["run_target_sql"](
                "select coalesce(jsonb_agg(to_jsonb(q) order by table_name),'[]')::text from (" + query + ") q;",
                query_label="cold_inventory_summary",
            )
            target_rows.extend(json.loads(target_payload))
        except BaseException as exc:
            _diag_failed(entry, exc)
            raise
        entry["result"] = "ok"
        DIAG["entries"].append(entry)
    source = {row["table_name"]: row for row in source_rows}
    target = {row["table_name"]: row for row in target_rows}
    by_name = {row["table_name"]: row for row in manifest}
    parents = {name: {fk["parent_table"] for fk in row["foreign_keys"]} for name, row in by_name.items()}
    inventory = []
    for name, meta in by_name.items():
        src_n, tgt_n = int(source[name]["n"]), int(target[name]["n"])
        same = source[name]["fp"] is not None and src_n == tgt_n and source[name]["fp"] == target[name]["fp"]
        source_only = target_only = 0
        blockers: dict[str, int] = {}
        if not same:
            entry = {"phase": "drift_scan", "table": name, "stage": "prepare"}
            try:
                pk = pk_columns(meta)
                pk_types = [next(c["type"] for c in meta.get("columns", []) if c["name"] == col) for col in pk] if meta.get("columns") else []
                if not pk_types:
                    shape = R["target_shape"](name); pk_types = shape.pk_types
                fk_specs = [shape for fk in meta["foreign_keys"] if (shape := fk_shape(fk))]
                scan_cols = list(dict.fromkeys(pk + [col for spec in fk_specs for col in spec[0]]))
                entry["stage"] = "source_scan"
                src_rows = R["source_scan"](name, scan_cols, pk, pk_types)
                entry["stage"] = "target_scan"
                tgt_rows = R["target_scan"](name, pk, pk)
                src_map = {R["key"](row, pk): row for row in src_rows}
                src_keys, tgt_keys = set(src_map), {R["key"](row, pk) for row in tgt_rows}
                delta = src_keys - tgt_keys
                source_only, target_only = len(delta), len(tgt_keys - src_keys)
                for fk, spec in zip([fk for fk in meta["foreign_keys"] if fk_shape(fk)], fk_specs):
                    child_cols, parent, parent_cols = spec
                    entry["stage"] = f"parent_scan:{parent}"
                    parent_rows = R["target_scan"](parent, parent_cols, parent_cols)
                    parent_keys = {tuple(str(row[col]) for col in parent_cols) for row in parent_rows}
                    blockers[fk["constraint_name"]] = sum(
                        1 for item in delta
                        if all(src_map[item].get(col) is not None for col in child_cols)
                        and tuple(str(src_map[item][col]) for col in child_cols) not in parent_keys
                    )
            except BaseException as exc:
                _diag_failed(entry, exc)
                raise
            entry["result"] = "ok"
            DIAG["entries"].append(entry)
        inventory.append({
            "table": name, "source_count": src_n, "target_count": tgt_n,
            "source_only": source_only, "target_only": target_only,
            "dependency_blockers": sum(blockers.values()), "dependency_blockers_by_fk": blockers,
            "fk_parents": sorted(parents[name]), "policy": meta["policy"], "tier": meta["tier"],
            "current_status": "EXACT" if same else "DRIFT",
        })
    hot = set(HOT_SEEDS)
    changed = True
    while changed:
        changed = False
        for row in inventory:
            if row["table"] not in hot and row["source_only"] and set(row["fk_parents"]) & hot:
                hot.add(row["table"]); changed = True
    cold, warm = set(), set()
    for row in inventory:
        name = row["table"]
        if name in hot or row["dependency_blockers"] or row["source_only"] > 1000 or row["tier"] == "GIANT":
            hot.add(name); row["drift_class"] = "HOT"
        elif row["source_only"] <= 5:
            cold.add(name); row["drift_class"] = "COLD"
        else:
            warm.add(name); row["drift_class"] = "WARM"
    for row in inventory:
        if row["table"] not in hot and set(row["fk_parents"]) & hot:
            hot.add(row["table"]); cold.discard(row["table"]); warm.discard(row["table"]); row["drift_class"] = "HOT"
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(), "status": "PASS_READ_ONLY_INVENTORY",
        "JWT_TTL_SECONDS": ttl, "source_write_occurred": False, "target_write_occurred": False,
        "apply_executions": 0, "tables": inventory,
        "plan": {"cold": topological(cold, parents), "warm": topological(warm, parents), "hot": topological(hot, parents)},
        "blocked_by_hot_parents": sorted(row["table"] for row in inventory if set(row["fk_parents"]) & hot),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = OUT / f"{stamp}-cold-first-inventory.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    os.chmod(path, 0o600)
    _diag_write("COMPLETED")
    print(json.dumps({"status": report["status"], "report": str(path.relative_to(ROOT)), "tables": len(inventory), "cold": len(cold), "warm": len(warm), "hot": len(hot)}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
