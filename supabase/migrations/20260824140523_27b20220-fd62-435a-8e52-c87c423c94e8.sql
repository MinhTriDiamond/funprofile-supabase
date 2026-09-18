CREATE TABLE public.stale_account_reminder_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text,
  batch_number integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  resend_message_id text,
  final_status text NOT NULL DEFAULT 'pending',
  final_status_at timestamptz,
  final_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stale_account_reminder_log_user_unique UNIQUE (user_id),
  CONSTRAINT stale_account_reminder_log_status_chk CHECK (final_status IN ('pending','signed','deleted','held'))
);

GRANT SELECT ON public.stale_account_reminder_log TO authenticated;
GRANT ALL ON public.stale_account_reminder_log TO service_role;

ALTER TABLE public.stale_account_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stale reminder log"
ON public.stale_account_reminder_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_stale_reminder_batch ON public.stale_account_reminder_log (batch_number);
CREATE INDEX idx_stale_reminder_status ON public.stale_account_reminder_log (final_status);

CREATE TRIGGER trg_stale_reminder_updated_at
BEFORE UPDATE ON public.stale_account_reminder_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chọn người nhận cho một đợt: quét real-time, loại người đã ký hoặc đã nhận nhắc
CREATE OR REPLACE FUNCTION public.stale_reminder_pick_batch(p_batch integer, p_limit integer DEFAULT 36)
RETURNS TABLE (user_id uuid, email text, account_created_at timestamptz, days_stale integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_batch < 1 OR p_batch > 3 THEN
    RAISE EXCEPTION 'batch_number phải trong khoảng 1..3';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id,
    p.email,
    p.created_at,
    s.days_stale
  FROM public.stale_unaccepted_accounts_log s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE COALESCE(p.law_of_light_accepted, false) = false
    AND p.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.stale_account_reminder_log r WHERE r.user_id = p.id
    )
  ORDER BY p.id, s.scanned_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.stale_reminder_pick_batch(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_reminder_pick_batch(integer, integer) TO service_role;

-- Số người trong danh sách gốc đã quay lại ký (để báo cáo loại trừ)
CREATE OR REPLACE FUNCTION public.stale_reminder_excluded_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT s.user_id)::integer
  FROM public.stale_unaccepted_accounts_log s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE COALESCE(p.law_of_light_accepted, false) = true;
$$;

REVOKE ALL ON FUNCTION public.stale_reminder_excluded_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_reminder_excluded_count() TO service_role;

-- Ghi nhận 1 email gửi thành công
CREATE OR REPLACE FUNCTION public.stale_reminder_record_sent(
  p_user_id uuid,
  p_email text,
  p_batch integer,
  p_message_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stale_account_reminder_log (user_id, email, batch_number, resend_message_id)
  VALUES (p_user_id, p_email, p_batch, p_message_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.stale_reminder_record_sent(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_reminder_record_sent(uuid, text, integer, text) TO service_role;

-- Ngày 10: quét real-time, đánh dấu "đã ký" và trả danh sách chờ xoá kèm số bài viết
CREATE OR REPLACE FUNCTION public.stale_reminder_deletion_preview()
RETURNS TABLE (
  user_id uuid,
  email text,
  username text,
  account_created_at timestamptz,
  reminder_sent_at timestamptz,
  batch_number integer,
  post_count integer,
  days_since_reminder integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Người đã hoàn tất ký -> giữ nguyên, ghi log
  UPDATE public.stale_account_reminder_log r
     SET final_status = 'signed',
         final_status_at = now(),
         final_note = 'Đã hoàn tất ký Luật Ánh Sáng'
    FROM public.profiles p
   WHERE p.id = r.user_id
     AND COALESCE(p.law_of_light_accepted, false) = true
     AND r.final_status = 'pending';

  RETURN QUERY
  SELECT
    r.user_id,
    r.email,
    p.username,
    p.created_at,
    r.sent_at,
    r.batch_number,
    (SELECT COUNT(*) FROM public.posts po WHERE po.user_id = r.user_id)::integer,
    EXTRACT(DAY FROM (now() - r.sent_at))::integer
  FROM public.stale_account_reminder_log r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.final_status = 'pending'
    AND COALESCE(p.law_of_light_accepted, false) = false
  ORDER BY r.batch_number, r.sent_at;
END;
$$;

REVOKE ALL ON FUNCTION public.stale_reminder_deletion_preview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_reminder_deletion_preview() TO service_role;

-- Ghi kết quả cuối sau khi CTO xác nhận và xoá xong
CREATE OR REPLACE FUNCTION public.stale_reminder_finalize(
  p_user_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('signed','deleted','held') THEN
    RAISE EXCEPTION 'status không hợp lệ: %', p_status;
  END IF;

  UPDATE public.stale_account_reminder_log
     SET final_status = p_status,
         final_status_at = now(),
         final_note = p_note
   WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.stale_reminder_finalize(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_reminder_finalize(uuid, text, text) TO service_role;