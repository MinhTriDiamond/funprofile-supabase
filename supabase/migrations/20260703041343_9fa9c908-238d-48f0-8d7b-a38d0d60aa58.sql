-- BTC Sub-phase E: Backup schema + review queue table + disable class A
CREATE SCHEMA IF NOT EXISTS audit_btc_aux_20260703;
REVOKE ALL ON SCHEMA audit_btc_aux_20260703 FROM PUBLIC;
GRANT USAGE ON SCHEMA audit_btc_aux_20260703 TO service_role;

CREATE TABLE IF NOT EXISTS audit_btc_aux_20260703.aux_snapshot AS
SELECT *, now() AS snapshot_at FROM public.profile_btc_aux_addresses;

CREATE TABLE IF NOT EXISTS audit_btc_aux_20260703.donations_snapshot AS
SELECT d.*, now() AS snapshot_at FROM public.donations d
WHERE d.token_symbol='BTC' AND (
  d.sender_id IN (SELECT DISTINCT user_id FROM public.profile_btc_aux_addresses WHERE source='hd_input_back')
  OR d.recipient_id IN (SELECT DISTINCT user_id FROM public.profile_btc_aux_addresses WHERE source='hd_input_back'));

CREATE TABLE IF NOT EXISTS audit_btc_aux_20260703.wallet_transfers_snapshot AS
SELECT wt.*, now() AS snapshot_at FROM public.wallet_transfers wt
WHERE wt.chain_id=0 AND wt.user_id IN (SELECT DISTINCT user_id FROM public.profile_btc_aux_addresses WHERE source='hd_input_back');

ALTER TABLE public.profile_btc_aux_addresses
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS classification text;
CREATE INDEX IF NOT EXISTS idx_btc_aux_disabled ON public.profile_btc_aux_addresses(disabled_at) WHERE disabled_at IS NOT NULL;

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS integrity_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS integrity_reason text,
  ADD COLUMN IF NOT EXISTS integrity_flagged_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_donations_integrity_status ON public.donations(integrity_status) WHERE integrity_status<>'ok';

CREATE TABLE IF NOT EXISTS public.btc_aux_address_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aux_id uuid,
  address text NOT NULL UNIQUE,
  user_id uuid,
  username text,
  source text,
  classification text NOT NULL,
  tx_count bigint,
  funded_btc numeric,
  broad_don_count integer,
  broad_don_btc numeric,
  verdict text NOT NULL DEFAULT 'pending',
  verdict_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_verdict_e CHECK (verdict IN ('pending','keep','disable','exchange','needs_manual'))
);
GRANT SELECT ON public.btc_aux_address_review_queue TO authenticated;
GRANT ALL ON public.btc_aux_address_review_queue TO service_role;
ALTER TABLE public.btc_aux_address_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin doc review queue" ON public.btc_aux_address_review_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service role quan ly review queue" ON public.btc_aux_address_review_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_btc_aux_review_queue_updated
  BEFORE UPDATE ON public.btc_aux_address_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.profile_btc_aux_addresses SET disabled_at=now(), disabled_reason='Sub-phase E: exchange/hot wallet certain - auto disable', classification='A_exchange_certain' WHERE address IN (
'14hQSLvMYVgFFi4wot8uuwybeXESqhojTN','15UmfubZy5vNufWYb746YAjP9pStLHwieo','1GPwXxQ52ov3NA2JRALpLtuAYmskGJ9pzu','1KbDEg1tDz2ErYgaDbaDhhawnLrSQFaFx5','1AZ7aYCT6JPLF1EZ7PgymfFtH4xK44CcCP','bc1q8wwklhujudhsamrqg5w7ffdd4g2qv4j5es7gdr','1LdjQML26UQVCdG646dnVyZCeuPuXwvs8S','1QDFb5gS5pGvjds9N9dHY5Svdp4iKHxqew','18SZmycHPmmb9fLCiS1qgdM22F3M5hjXaS','bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h','3EKQ1oWXLRi1znyyB9pUR9bneUYRwcqk18','3Jhk8VUV7aN7QFABEoDLTzLC2DVQS9GfFU','3LEQkLWY4Y5T9TGfknB3ymMRxWwgfREaZi','377J2CAgzVaQEfPnEED9dmKYhE7xpBQZyY','bc1qldfs940ljewxttplvkl6w82hjpd730p26ywat7','3552WcRHSQ8GMYWDLxhVjt6d9cArzLZVWA','36VLbwVy1EGVQtPrZrnwJQGaApoQpa53vo','bc1qwelntg7tpxwgmh7gea0kycclx87mksnvhaadgf','34D73CV3Ppz6f8cHXDhhrtPv6Eif8q8bo8','34LEjvihs6gUYjTMoS9y4Axtv4rN8TrXqt','3PX75Qjt1kvgXNS4uxyCVWzE2nwcXjEL17','39Gk7idbKqpf2AiyuzMCEnp26nTbP6HwXY','3R2HtThEykLeYcL53UnQRjKDSXGJZu53ce','3FHjvYSChMiKcH9YiXmG3Czhj4DsQrUEqP','3BMj2SMa4sT844QjWoch1zEdAmoppmZe5t','37NeW2JyyD8XX589WRemPiNabA2Y5xiBs6','332W2rk4hGMVN9QCbqbry1ZjFr33wjEhN4','3GJeqi65hFXYuLWc62rpRK78usqQnvkAmX','3QDC865jMW3e2QV6VjaV8gzUwm5RXz8Qpv','3PqAyEUBMoPWZNqZPWW9GVqTpCWvy2yCyi','39rQhuRUoPDHYBZxsRBjXfDxM3nchVk6gs','3Dvr2kiByxzaTZZMbCAG63NADzZJcL16UG','3KhxioHPSJwKJ57RZjeGo8fZtE5iTk2M4Q','36EsZBXv3NJbX3mbcpSHjxERv7kWYf4zmH','35C2L1pCgwzBHNcDcVL1a5RuoefeWqyjAR','3LkCG1Ep5FN3ogxnQbUh7iC9Nfs6DNN3sU','38aN35prJErfxRYHze1MrfNLE2ZkYQAxSc','3PTrWPhg2MZ28HF3HYTPqMYrom2kokT3WJ','3Dc1UdgSauq7K6gr1NSV3He1KUrhRgJxhk','3CVDFPmkQoy8QB6rCbLjDRL9D9WacMBJzT','bc1qjm3a45nq2aaqu0mkcp0u6w8vh0dwelz4d9uf4q','3G3H8nR5rRaco3YngLg6tmKVMfoD7QCeUb','bc1q4vxcxw7mpg9dcryqu0kav8awrn7qk5e6wgs3hg','1C6XJtNXiuXvk4oUAVMkKF57CRpaTrN5Ra','1GbUhB5Aub17yjLaFf1fPNFN8icPzXn3sU','bc1qcza6s6ew2kaxe9hdyrqqeuadc3za7fva5yjcnf','3KMmeqPeQcngyTehdfSwsGqvxfU7J7qtc8','bc1qu4g0dq83alvp66myj6et2um787thh5jlyzyn0l','bc1qqz623jyqdsh2w5y5kdmzk2ws6mzr2mt2etv5gx','bc1qsatlphjcgvzlt9xhsgn0dnjus5jgwg83dr05c6','bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v','12XZMdaAGmcHf4ocFSqpd8jFd1WH7RHUPs','bc1q06ulsqumdm9wptcqhd3ykr7lrhlr9em3advpwx','1KnSe2JscY2JBvW3WmieyBqcSd4UzWGHEb','bc1ptukzmjhe8srvlgzt6jv8fnd9jutnmtkws8fa5kawvdpjrnykxrmsuxvlld','bc1py8m5c0683vuljgcwxh57zcxaq4y6073vtfkpdhx2n0wf5wkdt6lqtm3d6e','bc1qhnzy8cd0ufxqv7tsy7graj7k2fr4h3a9gyf7yq9mxrf63sujncpsr985du','bc1pr5nnh4m9gng5j48cuqh8rrkfw64gs6hdywedd82t7gvq2lsj40msr0ch9e','bc1qpsys7sfk5u7ue3lffwzszzvffhtku78kr0vva4','bc1pmz9kzug9kfju6tmpavzyryn9hgjudnfpsyx5w942z8zq4dazju0sunnqqh','bc1pafd79rmn2e87f2vgef5ww5sjuwz744pwrl0fy4c056jwkh08k07smyga2g','bc1p9s8dgtg2vud4q5hjl2rl3fs2dzmuzux49778dz5844fdnd0q97nqfqll5r','14DCvQxowZQdNegx5WCezFRPrFUxjSLQx9','bc1qq2mvrp4g3ugd424dw4xv53rgsf8szkrv853jrc','bc1qf94dn2q3ujywqqhs6334wy702wyjnda7fstcez','bc1qq6q05wmkl8355dm76recphc2jhevd8k67cu8y0','bc1pq73d3nqevftvef6sy4cw8wlncp7f05kvquykgs4za25wqttkz6qq84rcyy','1GrwDkr33gT6LuumniYjKEGjTLhsL5kmqC','bc1qr35hws365juz5rtlsjtvmulu97957kqvr3zpw3','bc1qujepl0k5n0ga2e86yskvxa6auehpf6dlf84dx0','bc1qfw8h4tqpjxn474qang0xr5hy9thpqe895hlckq','3CAQAw7m95axbY761Xq8d9DADhjNaX9b8o','1DLeNApsHNNzUMNZJVoXeyEY5sdp8vzx3w','bc1qh8k9hfd3mj83f40kse57t9p5dn9hhehmfpuhvk','bc1qmktha97ums5ruyvd7xfl94ndl380vdgpq0rxjur50046vrtfft9qk4djfd','3Dwi84yaHe9Tpgor6YFhXFA7b652j55rSk','bc1qwmseradarurwayd6audskpphnae6qqtqzy48p5'
) AND disabled_at IS NULL;

UPDATE public.donations d
SET integrity_status='suspect_aux_exchange',
    integrity_reason='Sub-phase E: sender_address khop vi exchange/hot wallet bi disable qua aux hd_input_back',
    integrity_flagged_at=now()
WHERE d.token_symbol='BTC' AND d.integrity_status='ok' AND d.sender_address IS NOT NULL
  AND lower(d.sender_address) IN (SELECT lower(address) FROM public.profile_btc_aux_addresses WHERE classification='A_exchange_certain' AND disabled_at IS NOT NULL);