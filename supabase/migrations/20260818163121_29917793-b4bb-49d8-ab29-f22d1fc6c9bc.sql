-- 1. scanner_watermarks
CREATE TABLE public.scanner_watermarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id      integer NOT NULL,
  source        text    NOT NULL CHECK (source IN ('erc20','native')),
  token_address text,
  last_block    bigint  NOT NULL DEFAULT 0,
  head_block    bigint  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX scanner_watermarks_uniq
  ON public.scanner_watermarks (chain_id, source, coalesce(token_address, ''));

GRANT SELECT ON public.scanner_watermarks TO authenticated;
GRANT ALL ON public.scanner_watermarks TO service_role;

ALTER TABLE public.scanner_watermarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scanner watermarks"
  ON public.scanner_watermarks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER scanner_watermarks_updated_at
  BEFORE UPDATE ON public.scanner_watermarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. scanner_block_gaps
CREATE TABLE public.scanner_block_gaps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id    integer NOT NULL,
  block       bigint  NOT NULL,
  reason      text    NOT NULL CHECK (reason IN ('null_from_node','rpc_error')),
  retries     integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, block)
);

CREATE INDEX scanner_block_gaps_unresolved
  ON public.scanner_block_gaps (chain_id, block)
  WHERE resolved_at IS NULL;

GRANT SELECT ON public.scanner_block_gaps TO authenticated;
GRANT ALL ON public.scanner_block_gaps TO service_role;

ALTER TABLE public.scanner_block_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scanner block gaps"
  ON public.scanner_block_gaps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER scanner_block_gaps_updated_at
  BEFORE UPDATE ON public.scanner_block_gaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RPC: đẩy watermark (chỉ tiến, không lùi) — dành cho tiến trình quét nền
CREATE OR REPLACE FUNCTION public.scanner_watermark_advance(
  p_chain_id      integer,
  p_source        text,
  p_token_address text,
  p_last_block    bigint,
  p_head_block    bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'scanner_watermark_advance: service_role only';
  END IF;

  INSERT INTO public.scanner_watermarks (chain_id, source, token_address, last_block, head_block)
  VALUES (p_chain_id, p_source, lower(p_token_address), GREATEST(p_last_block, 0), GREATEST(p_head_block, 0))
  ON CONFLICT (chain_id, source, coalesce(token_address, ''))
  DO UPDATE SET
    last_block = GREATEST(public.scanner_watermarks.last_block, EXCLUDED.last_block),
    head_block = GREATEST(public.scanner_watermarks.head_block, EXCLUDED.head_block),
    updated_at = now()
  RETURNING last_block INTO v_last;

  RETURN v_last;
END;
$$;

REVOKE ALL ON FUNCTION public.scanner_watermark_advance(integer, text, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scanner_watermark_advance(integer, text, text, bigint, bigint) TO service_role;

-- 4. RPC: admin xem tình trạng quét
CREATE OR REPLACE FUNCTION public.scanner_rpc_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'scanner_rpc_status: admin only';
  END IF;

  SELECT jsonb_build_object(
    'watermarks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'chain_id', w.chain_id,
        'source', w.source,
        'token_address', w.token_address,
        'last_block', w.last_block,
        'head_block', w.head_block,
        'lag_blocks', GREATEST(w.head_block - w.last_block, 0),
        'updated_at', w.updated_at
      ) ORDER BY w.source, w.token_address)
      FROM public.scanner_watermarks w
    ), '[]'::jsonb),
    'unresolved_gaps', (
      SELECT count(*) FROM public.scanner_block_gaps g WHERE g.resolved_at IS NULL
    ),
    'oldest_unresolved_gap', (
      SELECT min(g.block) FROM public.scanner_block_gaps g WHERE g.resolved_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.scanner_rpc_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scanner_rpc_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_rpc_status() TO service_role;