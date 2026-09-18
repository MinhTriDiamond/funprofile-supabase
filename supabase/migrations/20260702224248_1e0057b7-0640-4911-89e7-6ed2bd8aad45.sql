
CREATE SCHEMA IF NOT EXISTS benefactors_fix_20260702;

-- A1. Backup mọi row CAMLY sẽ bị reprice (price_source='reference' + price=1)
CREATE TABLE benefactors_fix_20260702.donations_camly_reference_backup AS
SELECT id, sender_id, recipient_id, token_symbol, chain_id, amount,
       amount_usd, price_usd_at_donation, price_source, tx_hash, created_at
FROM public.donations
WHERE token_symbol = 'CAMLY'
  AND price_source = 'reference'
  AND price_usd_at_donation = 1;

-- A2. Snapshot 5 view leaderboard trước khi sửa
CREATE TABLE benefactors_fix_20260702.benefactor_before_all AS
SELECT * FROM public.get_benefactor_leaderboard(100, 0, 'all', NULL, NULL, NULL);

CREATE TABLE benefactors_fix_20260702.benefactor_before_month AS
SELECT * FROM public.get_benefactor_leaderboard(100, 0, 'month', NULL, NULL, NULL);

CREATE TABLE benefactors_fix_20260702.recipient_before_all AS
SELECT * FROM public.get_recipient_leaderboard(100, 0, 'all', NULL, NULL, NULL);

CREATE TABLE benefactors_fix_20260702.recipient_before_month AS
SELECT * FROM public.get_recipient_leaderboard(100, 0, 'month', NULL, NULL, NULL);

CREATE TABLE benefactors_fix_20260702.global_stats_before AS
SELECT * FROM public.get_donation_global_stats('all', NULL, NULL);

-- A3. Metadata
CREATE TABLE benefactors_fix_20260702._meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO benefactors_fix_20260702._meta (key, value) VALUES
  ('purpose', 'Benefactors leaderboard correction v1 — reprice CAMLY, add outlier cap, exclude testnet + FUN'),
  ('spec_ref', 'docs/audit/m6d-ssot-2026-07/SSOT_SPEC_FINAL.md'),
  ('rollback_note', 'Xem migration reverse trong docs/audit/benefactors-2026-07/CORRECTION_REPORT.md');

-- Không cấp public access — chỉ admin và service_role
REVOKE ALL ON SCHEMA benefactors_fix_20260702 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA benefactors_fix_20260702 TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA benefactors_fix_20260702 TO service_role;
