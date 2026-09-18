
-- G4: add raw_sha256 to cache for integrity verification
ALTER TABLE public.btc_raw_tx_cache
  ADD COLUMN IF NOT EXISTS raw_sha256 TEXT;

CREATE INDEX IF NOT EXISTS btc_raw_tx_cache_sha256_idx
  ON public.btc_raw_tx_cache(raw_sha256)
  WHERE raw_sha256 IS NOT NULL;

-- G4: transactional batch persister
-- Only service_role can EXECUTE (edge functions using SUPABASE_SECRET_KEY).
-- All 3 upserts run in one implicit transaction (single function call).
CREATE OR REPLACE FUNCTION public.btc_persist_semantic_batch(
  p_cache_rows    JSONB DEFAULT '[]'::jsonb,
  p_semantic_rows JSONB DEFAULT '[]'::jsonb,
  p_review_rows   JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cache_inserted    INT := 0;
  v_semantic_inserted INT := 0;
  v_semantic_updated  INT := 0;
  v_review_inserted   INT := 0;
BEGIN
  -- 1) Cache upsert (idempotent on tx_hash)
  WITH ins AS (
    INSERT INTO public.btc_raw_tx_cache
      (tx_hash, raw_json, raw_sha256, block_height, block_time, size_bytes, source, fetched_at)
    SELECT
      (r->>'tx_hash')::text,
      (r->'raw_json'),
      (r->>'raw_sha256')::text,
      NULLIF(r->>'block_height','')::int,
      NULLIF(r->>'block_time','')::timestamptz,
      NULLIF(r->>'size_bytes','')::int,
      COALESCE(r->>'source','mempool.space'),
      COALESCE(NULLIF(r->>'fetched_at','')::timestamptz, now())
    FROM jsonb_array_elements(COALESCE(p_cache_rows,'[]'::jsonb)) AS r
    ON CONFLICT (tx_hash) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_cache_inserted FROM ins;

  -- 2) Semantic upsert (idempotent on (chain_family,tx_hash,vout_index,recipient_address))
  WITH up AS (
    INSERT INTO public.btc_tx_semantic
      (chain_family, tx_hash, vout_index, block_height, block_time,
       flow_type, sender_user, recipient_user, sender_address, recipient_address,
       amount_sat, is_self_transfer, is_change, is_treasury, is_coinjoin,
       tags, classifier_version, classified_at, raw_tx_cached_at, review_queue_id)
    SELECT
      COALESCE(r->>'chain_family','bitcoin'),
      (r->>'tx_hash')::text,
      (r->>'vout_index')::int,
      NULLIF(r->>'block_height','')::int,
      NULLIF(r->>'block_time','')::timestamptz,
      (r->>'flow_type')::text,
      NULLIF(r->>'sender_user','')::uuid,
      NULLIF(r->>'recipient_user','')::uuid,
      NULLIF(r->>'sender_address','')::text,
      (r->>'recipient_address')::text,
      (r->>'amount_sat')::bigint,
      COALESCE((r->>'is_self_transfer')::bool,false),
      COALESCE((r->>'is_change')::bool,false),
      COALESCE((r->>'is_treasury')::bool,false),
      COALESCE((r->>'is_coinjoin')::bool,false),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(r->'tags')), '{}'::text[]),
      COALESCE(r->>'classifier_version','v2.0.0-g4'),
      COALESCE(NULLIF(r->>'classified_at','')::timestamptz, now()),
      NULLIF(r->>'raw_tx_cached_at','')::timestamptz,
      NULLIF(r->>'review_queue_id','')::uuid
    FROM jsonb_array_elements(COALESCE(p_semantic_rows,'[]'::jsonb)) AS r
    ON CONFLICT (chain_family, tx_hash, vout_index, recipient_address)
    DO UPDATE SET
      flow_type          = EXCLUDED.flow_type,
      sender_user        = EXCLUDED.sender_user,
      recipient_user     = EXCLUDED.recipient_user,
      sender_address     = EXCLUDED.sender_address,
      amount_sat         = EXCLUDED.amount_sat,
      is_self_transfer   = EXCLUDED.is_self_transfer,
      is_change          = EXCLUDED.is_change,
      is_treasury        = EXCLUDED.is_treasury,
      is_coinjoin        = EXCLUDED.is_coinjoin,
      tags               = EXCLUDED.tags,
      classifier_version = EXCLUDED.classifier_version,
      classified_at      = now(),
      review_queue_id    = EXCLUDED.review_queue_id,
      updated_at         = now()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    count(*) FILTER (WHERE inserted),
    count(*) FILTER (WHERE NOT inserted)
  INTO v_semantic_inserted, v_semantic_updated
  FROM up;

  -- 3) Review queue upsert (deterministic id from caller: sha256(tx|vout|reason) → uuid v5)
  WITH ins AS (
    INSERT INTO public.btc_review_queue
      (id, tx_hash, vout_index, reason, severity, evidence, suggested_verdict, status)
    SELECT
      (r->>'id')::uuid,
      (r->>'tx_hash')::text,
      NULLIF(r->>'vout_index','')::int,
      (r->>'reason')::text,
      COALESCE(r->>'severity','medium'),
      COALESCE(r->'evidence','{}'::jsonb),
      r->'suggested_verdict',
      COALESCE(r->>'status','pending')
    FROM jsonb_array_elements(COALESCE(p_review_rows,'[]'::jsonb)) AS r
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_review_inserted FROM ins;

  RETURN jsonb_build_object(
    'cache_inserted',    v_cache_inserted,
    'semantic_inserted', v_semantic_inserted,
    'semantic_updated',  v_semantic_updated,
    'review_inserted',   v_review_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.btc_persist_semantic_batch(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btc_persist_semantic_batch(JSONB, JSONB, JSONB) TO service_role;
