import importlib.util
import base64
import json
import io
import sys
import unittest
from pathlib import Path
from unittest import mock

PATH = Path(__file__).parents[1] / "scripts/post-copy-reconcile.py"
SPEC = importlib.util.spec_from_file_location("post_copy_reconcile", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReconcileTests(unittest.TestCase):
    @staticmethod
    def jwt(payload):
        encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        return f"header.{encoded}.signature"

    def test_jwt_ttl_sufficient_continues(self):
        token = self.jwt({"exp": 2000, "sub": "must-not-be-reported"})
        self.assertEqual(MODULE.require_fresh_jwt(token, now=1000), 1000)

    def test_jwt_ttl_low_blocks_safely(self):
        token = self.jwt({"exp": 1899})
        with self.assertRaisesRegex(MODULE.AuditError, "^JWT_REFRESH_REQUIRED$"):
            MODULE.require_fresh_jwt(token, now=1000)

    def test_malformed_jwt_blocks_safely(self):
        with self.assertRaisesRegex(MODULE.AuditError, "^JWT_REFRESH_REQUIRED$"):
            MODULE.require_fresh_jwt("not-a-jwt", now=1000)

    def test_jwt_preflight_does_not_log_token_or_payload(self):
        token = self.jwt({"exp": 1001, "sub": "private-sub", "email": "private@example.test"})
        with self.assertRaises(MODULE.AuditError) as raised:
            MODULE.require_fresh_jwt(token, now=1000)
        rendered = MODULE.safe_error(raised.exception)
        self.assertEqual(rendered, "JWT_REFRESH_REQUIRED")
        self.assertNotIn(token, rendered)
        self.assertNotIn("private-sub", rendered)
        self.assertNotIn("private@example.test", rendered)

    def test_audit_jwt_ttl_sufficient_continues_to_source_probe(self):
        table_state = {"table": "profiles", "status": "PASS_DRY_RUN"}
        report_paths = (MODULE.ROOT / "audit.json", MODULE.ROOT / "report.md")
        with mock.patch.object(MODULE, "jwt_ttl_seconds", return_value=900), \
             mock.patch.object(MODULE, "run_source_sql", return_value={"rows": [{"ok": 1}]}) as source, \
             mock.patch.object(MODULE, "run_target_sql", return_value="1"), \
             mock.patch.object(MODULE, "load_manifest", return_value={"profiles": {}}), \
             mock.patch.object(MODULE, "audit_table", return_value=table_state), \
             mock.patch.object(MODULE, "save_reports", return_value=report_paths), \
             mock.patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(MODULE.command_audit(("profiles",)), 0)
        source.assert_called_once()

    def test_audit_low_jwt_ttl_blocks_before_source_probe(self):
        report_paths = (MODULE.ROOT / "audit.json", MODULE.ROOT / "report.md")
        with mock.patch.object(MODULE, "jwt_ttl_seconds", return_value=899), \
             mock.patch.object(MODULE, "run_source_sql") as source, \
             mock.patch.object(MODULE, "save_reports", return_value=report_paths) as save, \
             mock.patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(MODULE.command_audit(("profiles",)), 2)
        source.assert_not_called()
        saved = save.call_args.args[0]
        self.assertEqual(saved["preflight"]["JWT_TTL_SECONDS"], 899)
        self.assertEqual(saved["error"], "JWT_REFRESH_REQUIRED")
        self.assertNotIn("payload", stdout.getvalue().lower())

    def test_audit_malformed_jwt_blocks_before_source_probe(self):
        report_paths = (MODULE.ROOT / "audit.json", MODULE.ROOT / "report.md")
        with mock.patch.object(MODULE, "jwt_ttl_seconds", side_effect=MODULE.AuditError("JWT_REFRESH_REQUIRED")), \
             mock.patch.object(MODULE, "run_source_sql") as source, \
             mock.patch.object(MODULE, "save_reports", return_value=report_paths) as save, \
             mock.patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(MODULE.command_audit(("profiles",)), 2)
        source.assert_not_called()
        saved = save.call_args.args[0]
        self.assertIsNone(saved["preflight"]["JWT_TTL_SECONDS"])
        self.assertEqual(saved["error"], "JWT_REFRESH_REQUIRED")

    def test_rehearsal_low_jwt_ttl_blocks_before_freshness_reread(self):
        report_path = MODULE.ROOT / "rehearsal.json"
        with mock.patch.object(MODULE, "jwt_ttl_seconds", return_value=899), \
             mock.patch.object(MODULE, "source_only_ids") as reread, \
             mock.patch.object(MODULE, "save_rehearsal_report", return_value=report_path) as save, \
             mock.patch("sys.stdout", new_callable=io.StringIO):
            result = MODULE.command_rehearse("auth-deps", MODULE.ROOT / "unused-audit.json", True)
        self.assertEqual(result, 2)
        reread.assert_not_called()
        saved = save.call_args.args[0]
        self.assertEqual(saved["JWT_TTL_SECONDS"], 899)
        self.assertEqual(saved["error"], "JWT_REFRESH_REQUIRED")

    def test_apply_low_jwt_ttl_blocks_before_freshness_reread(self):
        report_path = MODULE.ROOT / "apply.json"
        with mock.patch.object(MODULE, "require_fresh_jwt", side_effect=MODULE.AuditError("JWT_REFRESH_REQUIRED")), \
             mock.patch.object(MODULE, "source_only_ids") as reread, \
             mock.patch.object(MODULE, "save_apply_report", return_value=report_path) as save, \
             mock.patch("sys.stdout", new_callable=io.StringIO):
            result = MODULE.command_apply("profiles", MODULE.ROOT / "unused-audit.json", True)
        self.assertEqual(result, 2)
        reread.assert_not_called()
        saved = save.call_args.args[0]
        self.assertIsNone(saved["JWT_TTL_SECONDS"])
        self.assertEqual(saved["error"], "JWT_REFRESH_REQUIRED")

    def test_pk_ordering_uuid_integer_and_composite(self):
        self.assertGreater(MODULE.pk_sort_key(("10",), ("int8",)), MODULE.pk_sort_key(("2",), ("int8",)))
        self.assertLess(MODULE.pk_sort_key(("a",), ("uuid",)), MODULE.pk_sort_key(("b",), ("uuid",)))
        self.assertGreater(MODULE.pk_sort_key(("x", "10"), ("text", "int8")), MODULE.pk_sort_key(("x", "2"), ("text", "int8")))

    def test_source_pagination_at_1000_boundary(self):
        data = [{"id": i} for i in range(2000)]
        calls = []
        def fetch(cursor, limit):
            calls.append(cursor)
            start = 0 if cursor is None else cursor[0] + 1
            return data[start:start + limit]
        self.assertEqual(len(MODULE.paginate(fetch, ("id",))), 2000)
        self.assertEqual(len(calls), 3)

    def test_historical_gap_classification(self):
        cutoff = MODULE.POSTS_CUTOFF
        rows = [{"created_at": cutoff}, {"created_at": "2026-09-24T00:00:00+00:00"}]
        self.assertEqual(sum(str(row["created_at"]) <= cutoff for row in rows), 1)

    def test_mixed_trigger_state_restoration(self):
        sql = MODULE.restore_trigger_statements("profiles", ("a:O", "b:D", "c:R", "d:A"))
        self.assertIn(" ENABLE TRIGGER ", sql[0])
        self.assertIn(" DISABLE TRIGGER ", sql[1])
        self.assertIn(" ENABLE REPLICA TRIGGER ", sql[2])
        self.assertIn(" ENABLE ALWAYS TRIGGER ", sql[3])

    def test_generated_columns_are_excluded(self):
        self.assertEqual(MODULE.generated_insert_columns(["id", "username_normalized"], ["username_normalized"]), ["id"])

    def test_live_sessions_policy_transform(self):
        row = {name: "sensitive" for name in MODULE.LIVE_SESSION_NULL_FIELDS}
        row.update({name: True for name in MODULE.LIVE_SESSION_FALSE_FIELDS})
        transformed = MODULE.transform_live_session(row)
        self.assertTrue(all(transformed[name] is None for name in MODULE.LIVE_SESSION_NULL_FIELDS))
        self.assertTrue(all(transformed[name] is False for name in MODULE.LIVE_SESSION_FALSE_FIELDS))

    def test_exact_verification_failure_requests_rollback(self):
        with self.assertRaisesRegex(MODULE.AuditError, "roll back"):
            MODULE.exact_verification_or_rollback([1], [2])

    def test_errors_do_not_echo_secret_bearing_messages(self):
        message = MODULE.safe_error(RuntimeError("password=abc JWT=def"))
        self.assertNotIn("abc", message)
        self.assertNotIn("def", message)

    def test_target_shape_casts_internal_trigger_state_to_text(self):
        payload = '{"columns":[],"pk":[],"triggers":[],"fks":[]}'
        with mock.patch.object(MODULE, "run_target_sql", return_value=payload) as query:
            MODULE.target_shape("profiles")
        sql = query.call_args.args[0]
        self.assertIn("tgenabled::text", sql)
        self.assertEqual(query.call_args.kwargs["query_label"], "target_shape:profiles")

    def test_target_error_has_label_sqlstate_class_and_no_sql_dump(self):
        failed = mock.Mock(returncode=1, stdout="", stderr='ERROR:  42725: operator is not unique: text || "char"\n')
        with mock.patch.object(MODULE.subprocess, "run", return_value=failed):
            with mock.patch.dict(MODULE.os.environ, {"TARGET": "credential-bearing-connection"}):
                with self.assertRaises(MODULE.AuditError) as raised:
                    MODULE.run_target_sql("select raw_private_id from private_table", query_label="target_shape:profiles")
        message = str(raised.exception)
        self.assertIn("query_label=target_shape:profiles", message)
        self.assertIn("return_code=1", message)
        self.assertIn("sqlstate=42725", message)
        self.assertIn("error_class=syntax_error_or_access_rule_violation", message)
        self.assertNotIn("raw_private_id", message)
        self.assertNotIn("credential-bearing-connection", message)

    def test_auth_parent_scan_uses_fk_schema(self):
        fk = {"parent_schema": "auth", "parent_table": "users", "parent_columns": ["id"]}
        with mock.patch.object(MODULE, "target_scan", return_value=[]) as scan:
            self.assertEqual(MODULE.target_parent_keys(fk), set())
        self.assertEqual(scan.call_args.kwargs["schema"], "auth")

    def test_apply_is_not_reachable_from_audit_helpers(self):
        with mock.patch.object(MODULE.subprocess, "run") as run:
            self.assertEqual(MODULE.generated_insert_columns(["id"], []), ["id"])
            run.assert_not_called()

    def fingerprinted_row(self):
        return {field: "same" for field in MODULE.FRESH_FIELDS}

    def test_top_level_pass_without_table_status_continues_to_freshness_comparisons(self):
        saved = self.fingerprinted_row()
        for field in ("source_count", "target_count", "source_only_count", "target_only_count"):
            saved[field] = 0
        MODULE.assert_fresh_audit("PASS_DRY_RUN", saved, dict(saved))

    def test_top_level_blocked_safe_rejected(self):
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "STALE_AUDIT"):
            MODULE.assert_fresh_audit("BLOCKED_SAFE", self.fingerprinted_row(), self.fingerprinted_row())

    def test_missing_or_invalid_top_level_status_rejected(self):
        for status in (None, "", "PASS", 1):
            with self.subTest(status=status), self.assertRaisesRegex(MODULE.ApplySafetyError, "STALE_AUDIT"):
                MODULE.assert_fresh_audit(status, self.fingerprinted_row(), self.fingerprinted_row())

    def test_changed_source_pk_fingerprint_rejected(self):
        saved = self.fingerprinted_row()
        current = self.fingerprinted_row(); current["source_pk_fingerprint"] = "changed"
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "source_pk_fingerprint"):
            MODULE.assert_fresh_audit("PASS_DRY_RUN", saved, current)

    def test_changed_target_state_rejected(self):
        saved = self.fingerprinted_row()
        current = self.fingerprinted_row(); current["target_pk_fingerprint"] = "changed"
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "target_pk_fingerprint"):
            MODULE.assert_fresh_audit("PASS_DRY_RUN", saved, current)

    def test_parent_blocker_rejected(self):
        state = {"blocked_fk_references": 1, "dependency_blockers": {"posts_user_id_fkey": 1}, "dependency_blocker_count": 1}
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "PARENT_DEPENDENCY"):
            MODULE.validate_stage_blockers("posts", state)

    def test_auth_users_before_identities(self):
        self.assertEqual(MODULE.AUTH_RELATION_ORDER, (("auth", "users"), ("auth", "identities")))

    def test_exact_auth_comparison(self):
        MODULE.verify_auth_payload(["u1"], [{"id": "u1"}], [{"user_id": "u1"}])
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "AUTH_DEPENDENCY"):
            MODULE.verify_auth_payload(["u1"], [{"id": "u2"}], [])

    def test_profile_dependency_gate(self):
        state = {"blocked_fk_references": 1, "dependency_blockers": {"profiles_pinned_post_id_fkey": 1}, "dependency_blocker_count": 1}
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "PARENT_DEPENDENCY|PROFILE_DEPENDENCY"):
            MODULE.validate_stage_blockers("profiles", state)

    def test_post_blocker_counts_rows_vs_references(self):
        source_only = {("p1",), ("p2",)}
        source_map = {("p1",): {"a": "x", "b": "y"}, ("p2",): {"a": "ok", "b": None}}
        fks = [
            {"name": "fk_a", "parent_schema": "public", "columns": ["a"]},
            {"name": "fk_b", "parent_schema": "public", "columns": ["b"]},
        ]
        per_fk, rows, refs, fingerprint = MODULE.blocker_summary(source_only, source_map, fks, lambda fk: {("ok",)})
        self.assertEqual(per_fk, {"fk_a": 1, "fk_b": 1})
        self.assertEqual((rows, refs), (1, 2))
        self.assertEqual(len(fingerprint), 64)

    def test_dependency_fingerprint_is_canonical_across_input_order(self):
        source_map = {
            ("p1",): {"a": "missing", "b": "ok"},
            ("p2",): {"a": "ok", "b": None},
        }
        fks = [
            {"name": "fk_a", "parent_schema": "public", "columns": ["a"]},
            {"name": "fk_b", "parent_schema": "public", "columns": ["b"]},
        ]
        first = MODULE.blocker_summary({("p1",), ("p2",)}, source_map, fks, lambda fk: {("ok",)})
        second = MODULE.blocker_summary({("p2",), ("p1",)}, source_map, list(reversed(fks)), lambda fk: {("ok",)})
        self.assertEqual(first[3], second[3])

    def bounded_fixture(self):
        audit_source = {("p1",), ("existing",)}
        intended = {("p1",)}
        rows = [{"id": "p1", "content": "original"}]
        dependency = "dependency-fingerprint"
        saved = {
            "pk_columns": ["id"],
            "bounded_snapshot": {
                "source_set_fingerprint": MODULE.fingerprint_keys(audit_source),
                "intended_pk_fingerprint": MODULE.fingerprint_keys(intended),
                "intended_payload_fingerprint": MODULE.fingerprint_rows(rows, ["id"]),
                "intended_dependency_fingerprint": dependency,
            },
        }
        private = {
            "source_keys_at_audit": [list(item) for item in sorted(audit_source)],
            "intended_keys": [list(item) for item in sorted(intended)],
        }
        return saved, private, audit_source, rows, dependency

    def test_bounded_additive_source_rows_outside_intended_allowed(self):
        saved, private, source, rows, dependency = self.bounded_fixture()
        result = MODULE.validate_bounded_snapshot(saved, private, source | {("new",)}, rows, set(), dependency, 0)
        self.assertEqual(result["additive_rows_outside_intended"], 1)
        self.assertEqual(result["intended_keys"], {("p1",)})

    def test_bounded_intended_row_deleted_blocks(self):
        saved, private, source, rows, dependency = self.bounded_fixture()
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "NON_ADDITIVE"):
            MODULE.validate_bounded_snapshot(saved, private, source - {("p1",)}, rows, set(), dependency, 0)

    def test_bounded_intended_payload_changed_blocks(self):
        saved, private, source, _, dependency = self.bounded_fixture()
        changed = [{"id": "p1", "content": "changed"}]
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "PAYLOAD_CHANGED"):
            MODULE.validate_bounded_snapshot(saved, private, source, changed, set(), dependency, 0)

    def test_bounded_intended_dependency_changed_blocks(self):
        saved, private, source, rows, _ = self.bounded_fixture()
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "DEPENDENCY_CHANGED"):
            MODULE.validate_bounded_snapshot(saved, private, source, rows, set(), "changed", 0)

    def test_bounded_intended_pk_appearing_on_target_blocks(self):
        saved, private, source, rows, dependency = self.bounded_fixture()
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "TARGET_DRIFT"):
            MODULE.validate_bounded_snapshot(saved, private, source, rows, {("p1",)}, dependency, 0)

    def test_bounded_unrelated_target_addition_does_not_corrupt_validation(self):
        saved, private, source, rows, dependency = self.bounded_fixture()
        result = MODULE.validate_bounded_snapshot(saved, private, source, rows, {("unrelated",)}, dependency, 0)
        self.assertTrue(result["intended_payload_fingerprint_match"])

    def test_bounded_intended_set_never_auto_expands(self):
        saved, private, source, rows, dependency = self.bounded_fixture()
        result = MODULE.validate_bounded_snapshot(saved, private, source | {("new",)}, rows, set(), dependency, 0)
        self.assertEqual(result["intended_keys"], {("p1",)})

    def test_transformed_exact_verification(self):
        raw = {name: "credential" for name in MODULE.LIVE_SESSION_NULL_FIELDS}
        raw.update({name: True for name in MODULE.LIVE_SESSION_FALSE_FIELDS})
        expected = MODULE.transformed_expected_rows("live_sessions", [raw])
        MODULE.exact_verification_or_rollback(expected, [MODULE.transform_live_session(raw)])

    def test_generic_apply_without_stage_or_confirmation_rejected(self):
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "CONFIRM_WRITE_REQUIRED"):
            MODULE.require_apply_confirmation("profiles", False)
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "INVALID_APPLY_STAGE"):
            MODULE.require_apply_confirmation("all", True)

    def test_source_helper_cannot_be_invoked_in_write_mode(self):
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "forbidden"):
            MODULE.source_command("--write update public.profiles set bio=null")

    def sample_payloads(self, triggers=()):
        metadata = {"columns": [{"name": "id", "type": "uuid", "generated": ""}], "pk": ["id"], "triggers": list(triggers)}
        return [("public", "profiles", [{"id": "00000000-0000-0000-0000-000000000001"}], metadata, bool(triggers))]

    def test_rehearsal_cannot_commit_and_emits_mandatory_rollback(self):
        script = MODULE.build_transaction_script("profiles", self.sample_payloads(), mode="rehearse")
        lines = {line.strip().upper() for line in script.splitlines()}
        self.assertIn("ROLLBACK;", lines)
        self.assertNotIn("COMMIT;", lines)
        self.assertIn("REHEARSAL_FORCED_ROLLBACK", script)

    def test_apply_can_commit_only_in_apply_mode(self):
        apply_script = MODULE.build_transaction_script("profiles", self.sample_payloads(), mode="apply")
        rehearsal_script = MODULE.build_transaction_script("profiles", self.sample_payloads(), mode="rehearse")
        self.assertIn("COMMIT;", apply_script.splitlines())
        self.assertNotIn("COMMIT;", rehearsal_script.splitlines())
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "INVALID_TRANSACTION_MODE"):
            MODULE.build_transaction_script("profiles", self.sample_payloads(), mode="unknown")

    def test_rehearsal_missing_confirmation_rejected(self):
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "CONFIRM_REHEARSAL_REQUIRED"):
            MODULE.require_rehearsal_confirmation("auth-deps", False)

    def test_verification_precedes_forced_rollback(self):
        script = MODULE.build_transaction_script("profiles", self.sample_payloads(), mode="rehearse")
        self.assertLess(script.index("exact verification mismatch"), script.index("ROLLBACK;"))

    def test_trigger_restoration_checked_before_forced_rollback(self):
        script = MODULE.build_transaction_script("profiles", self.sample_payloads(("mixed:D",)), mode="rehearse")
        self.assertLess(script.rindex("trigger state mismatch"), script.index("ROLLBACK;"))
        self.assertIn('DISABLE TRIGGER "mixed"', script)

    def test_target_before_after_fingerprint_invariant(self):
        state = {"auth.users": {"count": 1, "pk_fingerprint": "abc", "trigger_states": []}}
        MODULE.rollback_invariant(state, dict(state))
        with self.assertRaisesRegex(MODULE.ApplySafetyError, "REHEARSAL_ROLLBACK_INVARIANT_FAILED"):
            MODULE.rollback_invariant(state, {"auth.users": {"count": 2, "pk_fingerprint": "def", "trigger_states": []}})

    def test_auth_rehearsal_invariant_covers_users_and_identities(self):
        self.assertEqual(MODULE.AUTH_RELATION_ORDER, (("auth", "users"), ("auth", "identities")))
        before = {
            "auth.users": {"count": 1, "pk_fingerprint": "u", "trigger_states": []},
            "auth.identities": {"count": 1, "pk_fingerprint": "i", "trigger_states": []},
        }
        MODULE.rollback_invariant(before, dict(before))


if __name__ == "__main__":
    unittest.main()
