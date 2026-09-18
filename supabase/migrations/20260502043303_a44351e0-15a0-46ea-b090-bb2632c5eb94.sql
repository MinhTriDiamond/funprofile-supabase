-- Connector Phase 2: admin audit + revert RPC

CREATE TABLE IF NOT EXISTS public.connector_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL, -- 'revert_link' | 'backfill_run' | 'config_update'
  target_link_id uuid REFERENCES public.connector_links(id) ON DELETE SET NULL,
  target_user_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_admin_audit_action ON public.connector_admin_audit(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connector_admin_audit_admin ON public.connector_admin_audit(admin_id, created_at DESC);

ALTER TABLE public.connector_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view connector audit"
ON public.connector_admin_audit FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RPC: revert connector link (NO REOPEN policy)
CREATE OR REPLACE FUNCTION public.connector_revert_link(
  _link_id uuid,
  _admin_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_base_score int;
  v_growth_total int := 0;
BEGIN
  -- AuthZ
  IF NOT public.has_role(_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT * INTO v_link FROM public.connector_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found';
  END IF;
  IF v_link.status = 'reverted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reverted');
  END IF;

  SELECT COALESCE((value)::int, 10) INTO v_base_score
  FROM public.connector_config WHERE key = 'base_score';

  -- Sum growth bonuses already awarded for this link
  SELECT COALESCE(SUM(score_delta),0) INTO v_growth_total
  FROM public.connector_growth_events WHERE link_id = _link_id;

  -- Mark link reverted
  UPDATE public.connector_links
     SET status = 'reverted',
         revert_reason = _reason,
         reverted_by = _admin_id,
         reverted_at = now(),
         updated_at = now()
   WHERE id = _link_id;

  -- Permanently close window (NO REOPEN)
  UPDATE public.connector_windows
     SET status = 'expired',
         matched_link_id = NULL,
         updated_at = now()
   WHERE user_id = v_link.new_user_id;

  -- Reverse Light Score: insert negative light_actions (audit-friendly)
  INSERT INTO public.light_actions(user_id, action_type, points, metadata)
  VALUES (
    v_link.connector_user_id,
    'FIRST_GIVER_CONNECTOR_REVERT',
    -1 * (v_base_score + v_growth_total),
    jsonb_build_object(
      'link_id', _link_id,
      'reason', _reason,
      'admin_id', _admin_id,
      'base_reverted', v_base_score,
      'growth_reverted', v_growth_total
    )
  );

  -- Notifications
  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  VALUES
  (
    v_link.connector_user_id,
    'connector_reverted_giver',
    '⚠️ Connector đã bị huỷ',
    format('Link Connector của bạn đã được huỷ bởi quản trị. Light Score liên quan (-%s) đã được hoàn lại.', v_base_score + v_growth_total),
    jsonb_build_object('link_id', _link_id, 'reason', _reason)
  ),
  (
    v_link.new_user_id,
    'connector_reverted_new_user',
    'ℹ️ Connector của bạn đã được gỡ',
    'Connector chính thức của bạn đã được quản trị gỡ bỏ. Cửa sổ 48h không được mở lại theo chính sách hệ thống.',
    jsonb_build_object('link_id', _link_id, 'reason', _reason)
  );

  -- Audit
  INSERT INTO public.connector_admin_audit(admin_id, action, target_link_id, target_user_id, reason, metadata)
  VALUES (
    _admin_id, 'revert_link', _link_id, v_link.new_user_id, _reason,
    jsonb_build_object(
      'connector_user_id', v_link.connector_user_id,
      'base_reverted', v_base_score,
      'growth_reverted', v_growth_total,
      'tx_hash', v_link.tx_hash
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'link_id', _link_id,
    'reverted_score', v_base_score + v_growth_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.connector_revert_link(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.connector_revert_link(uuid, uuid, text) TO authenticated;