-- BTC Attribution Resolver — Phase 2 (shadow mode infra)
-- Xem docs/audit/btc-attribution-resolver-phase1-20260823/HANDOFF.md cho bối cảnh Phase 1.
--
-- CHỈ log, KHÔNG đụng dữ liệu/quyết định thật. Migration này tạo hạ tầng ghi log so sánh —
-- CHƯA gắn lệnh gọi vào bất kỳ điểm code RC4 nào (scan-btc-transactions, btc-wallet-audit,
-- wallet-reconciliation-cron, btc-history-repair, btc-ownership-reverify, btc-parser-v2,
-- btc-discovery-v2). Việc đó chờ CTO duyệt danh sách 7 điểm trước.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. btc_resolver_shadow_log — chỉ service_role đọc/ghi, không cấp anon/authenticated.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.btc_resolver_shadow_log (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address                         text NOT NULL,     -- ĐÃ qua btc_normalize_address() trước khi lưu
  raw_address_legacy_side         text,               -- địa chỉ RAW (chưa normalize) mà logic cũ dùng để tra map — để điều tra lệch do case
  observed_at                     timestamptz NOT NULL DEFAULT now(),  -- thời điểm chạy shadow compare
  event_at                        timestamptz NOT NULL,                -- thời điểm giao dịch thật (block_time) dùng làm p_at cho resolve_btc_owner
  call_site                       text NOT NULL,      -- tên điểm code RC4 gọi tới, vd 'scan-btc-transactions:sender'
  tx_hash                         text,
  legacy_user_id                  uuid,               -- kết quả logic cũ suy ra (NULL nếu logic cũ không tìm thấy)
  legacy_source                   text NOT NULL,       -- nhãn nguồn logic cũ, vd 'btcToProfile', 'internalBtc', 'hd_change_verified'
  resolver_user_id                uuid,               -- kết quả resolve_btc_owner(address, event_at)
  is_match                        boolean NOT NULL,    -- legacy_user_id IS NOT DISTINCT FROM resolver_user_id
  suspected_legacy_format_mismatch boolean NOT NULL DEFAULT false,  -- xem trigger bên dưới — KHÔNG gộp vào "không khớp thật"
  priority_account_flag           boolean NOT NULL DEFAULT false,   -- xem trigger bên dưới — angelkim/angelutopia/...
  idempotency_key                 text NOT NULL,       -- chống ghi trùng khi retry cùng 1 sự kiện
  request_id                      text,
  created_by                      text NOT NULL,       -- tên function/cron gọi tới (không phải actor người dùng)
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_btc_shadow_log_idempotency ON public.btc_resolver_shadow_log(idempotency_key);
CREATE INDEX idx_btc_shadow_log_call_site ON public.btc_resolver_shadow_log(call_site);
CREATE INDEX idx_btc_shadow_log_mismatch ON public.btc_resolver_shadow_log(is_match) WHERE is_match = false;
CREATE INDEX idx_btc_shadow_log_priority ON public.btc_resolver_shadow_log(priority_account_flag) WHERE priority_account_flag = true;
CREATE INDEX idx_btc_shadow_log_address ON public.btc_resolver_shadow_log(address);
CREATE INDEX idx_btc_shadow_log_observed ON public.btc_resolver_shadow_log(observed_at);

GRANT ALL ON public.btc_resolver_shadow_log TO service_role;
ALTER TABLE public.btc_resolver_shadow_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btc_resolver_shadow_log_service_only"
  ON public.btc_resolver_shadow_log FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Không có policy nào khác ⇒ anon/authenticated không đọc/ghi được (mặc định deny khi RLS bật).

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Trigger phân loại "nghi do legacy-format" — KHÔNG để từng điểm gọi tự tính, tập trung ở
-- tầng bảng để nhất quán giữa 7 điểm code sẽ gắn sau này (đúng nguyên tắc "1 nguồn sự thật"
-- đã áp dụng cho resolve_btc_owner ở Phase 1).
--
-- Chỉ đánh dấu suspected_legacy_format_mismatch khi CẢ 3 đúng:
--   a) is_match = false (có lệch thật giữa 2 kết quả)
--   b) địa chỉ KHÔNG phải bech32 (không bắt đầu bc1) — chỉ base58 legacy mới case-sensitive
--   c) raw_address_legacy_side (chuỗi RAW logic cũ dùng để tra map) khác address (chuỗi đã
--      normalize) — tức logic cũ đã lowercase/biến dạng chuỗi trước khi tra, đúng lỗi đã phát
--      hiện ở Phase 1 (mục 3.3 HANDOFF.md).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_classify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.suspected_legacy_format_mismatch :=
    NOT NEW.is_match
    AND NEW.address !~* '^bc1'
    AND NEW.raw_address_legacy_side IS NOT NULL
    AND NEW.raw_address_legacy_side <> NEW.address;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_classify
  BEFORE INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_classify();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trigger đánh dấu + báo ngay khi dòng log liên quan tài khoản ưu tiên điều tra (mục 6).
-- Danh sách username lấy từ app_settings (admin sửa được mà không cần deploy lại), có fallback
-- cứng nếu app_settings chưa seed. Đánh dấu khi 1 TRONG 2 bên (logic cũ HOẶC resolver mới) trỏ
-- tới username này — kể cả khi is_match=true, vì mọi dòng log chạm tới các tài khoản này đều
-- có giá trị bằng chứng cho điều tra peel-chain đang mở, không chỉ riêng chỗ lệch.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES ('btc_shadow_priority_usernames',
  '["angelkim","angelutopia","angelthienhanh68","angelgiau","angelqueanh"]')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usernames text[];
BEGIN
  BEGIN
    SELECT ARRAY(SELECT jsonb_array_elements_text(value::jsonb))
    INTO v_usernames
    FROM public.app_settings WHERE key = 'btc_shadow_priority_usernames';
  EXCEPTION WHEN OTHERS THEN
    v_usernames := NULL;
  END;
  v_usernames := COALESCE(v_usernames,
    ARRAY['angelkim','angelutopia','angelthienhanh68','angelgiau','angelqueanh']);

  NEW.priority_account_flag := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id IN (NEW.legacy_user_id, NEW.resolver_user_id)
      AND p.username = ANY (v_usernames)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_priority_flag
  BEFORE INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_priority_flag();

-- Mở rộng notifications.type để có kênh báo-ngay tới admin (đúng khuôn 'btc_guard_drift',
-- 'wallet_reconciliation_alert' đã có sẵn cho cảnh báo hệ thống BTC).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY[
  'account_banned'::text, 'account_unbanned'::text, 'admin_email_farm'::text, 'admin_fraud_daily'::text,
  'admin_shared_device'::text, 'attestation_received'::text, 'btc_guard_drift'::text,
  'btc_shadow_priority_alert'::text, 'buddy_invite'::text,
  'care'::text, 'claim_reward'::text, 'comment'::text, 'comment_like'::text, 'did_promoted'::text,
  'donation'::text, 'epoch_claim_ready'::text, 'epoch_reset_info'::text, 'friend_accepted'::text,
  'friend_removed'::text, 'friend_request'::text, 'fun_mint_confirmed'::text, 'fun_mint_signed'::text,
  'haha'::text, 'impersonation_alert'::text, 'like'::text, 'live_replay_failed'::text,
  'live_started'::text, 'love'::text, 'mint_request_rejected'::text, 'mystery_box_legendary'::text,
  'mystery_box_received'::text, 'pet_battle_challenge'::text, 'pet_battle_result'::text,
  'pet_lumi_ready'::text, 'post_tagged'::text, 'post_moderation_hint'::text, 'pray'::text,
  'recovery_initiated'::text, 'reward_adjustment'::text, 'sbt_issued'::text, 'sbt_issued_quest'::text,
  'wallet_reconciliation_alert'::text, 'wow'::text
])));

-- Placeholder hệ thống cho actor_id (không phải hành vi của 1 user thật) — actor_id không còn
-- FK ràng buộc vào auth.users (đã DROP CONSTRAINT notifications_actor_id_fkey ở migration
-- 20260207061321), nên dùng UUID toàn số 0 an toàn, không đụng dữ liệu user thật.
CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.priority_account_flag THEN
    INSERT INTO public.notifications (user_id, actor_id, type, read)
    SELECT ur.user_id, '00000000-0000-0000-0000-000000000000'::uuid,
           'btc_shadow_priority_alert', false
    FROM public.user_roles ur
    WHERE ur.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_btc_shadow_log_priority_notify
  AFTER INSERT ON public.btc_resolver_shadow_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_btc_shadow_log_priority_notify();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. log_btc_resolver_shadow_comparison — điểm ghi DUY NHẤT vào btc_resolver_shadow_log.
-- Gọi resolve_btc_owner() thật, so khớp SAU khi cả 2 bên đã qua btc_normalize_address (mục 3
-- yêu cầu), rồi INSERT với ON CONFLICT (idempotency_key) DO NOTHING (mục 4 — idempotent).
-- Chỉ service_role được EXECUTE — cùng nguyên tắc với claim_btc_ownership ở Phase 1.
--
-- LƯU Ý: hàm này KHÔNG tự bọc try/catch nuốt lỗi ở tầng SQL — yêu cầu fail-open bắt buộc (mục
-- 2) được đảm bảo ở tầng gọi (edge function TS, xem _shared/btcResolverShadowLog.ts), vì lỗi
-- nguy hiểm nhất (timeout mạng, mất kết nối) xảy ra TRƯỚC KHI request tới được Postgres — SQL
-- exception handler không giúp được gì trong trường hợp đó.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_btc_resolver_shadow_comparison(
  p_address text,
  p_call_site text,
  p_legacy_user_id uuid,
  p_legacy_source text,
  p_idempotency_key text,
  p_created_by text,
  p_event_at timestamptz DEFAULT NULL,
  p_tx_hash text DEFAULT NULL,
  p_raw_address_legacy_side text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS public.btc_resolver_shadow_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text := public.btc_normalize_address(p_address);
  v_event_at timestamptz := COALESCE(p_event_at, now());
  v_resolver_user_id uuid;
  v_is_match boolean;
  v_row public.btc_resolver_shadow_log;
BEGIN
  v_resolver_user_id := public.resolve_btc_owner(v_addr, v_event_at);
  v_is_match := (p_legacy_user_id IS NOT DISTINCT FROM v_resolver_user_id);

  INSERT INTO public.btc_resolver_shadow_log (
    address, raw_address_legacy_side, event_at, call_site, tx_hash,
    legacy_user_id, legacy_source, resolver_user_id, is_match,
    idempotency_key, request_id, created_by
  ) VALUES (
    v_addr, p_raw_address_legacy_side, v_event_at, p_call_site, p_tx_hash,
    p_legacy_user_id, p_legacy_source, v_resolver_user_id, v_is_match,
    p_idempotency_key, p_request_id, p_created_by
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  RETURN v_row; -- NULL nếu bị chặn bởi idempotency (sự kiện đã ghi trước đó, vd retry)
END;
$$;

REVOKE ALL ON FUNCTION public.log_btc_resolver_shadow_comparison(
  text, text, uuid, text, text, text, timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_btc_resolver_shadow_comparison(
  text, text, uuid, text, text, text, timestamptz, text, text, text
) TO service_role;
