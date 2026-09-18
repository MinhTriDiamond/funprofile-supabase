-- BTC Attribution Resolver — Phase 1 (thiết kế + build, KHÔNG đụng dữ liệu sản xuất)
-- Xem docs/audit/btc-attribution-resolver-phase1-20260823/HANDOFF.md cho bối cảnh đầy đủ
-- (RC1/RC3/RC8, kết quả kiểm tra tiền đề, quyết định thiết kế).
--
-- Nguyên tắc: 1 nguồn sự thật duy nhất cho "địa chỉ BTC này đang thuộc user nào tại thời
-- điểm T" — mọi nơi khác (scanner, leaderboard, admin tool) sẽ ĐỌC qua resolve_btc_owner(),
-- không ai tự viết lại logic attribution. verification_method chỉ chấp nhận 'signature' hoặc
-- 'admin_manual' — KHÔNG có 'heuristic', đây là cách chặn RC8 (suy luận vòng tròn kiểu
-- hd_input_back) tái diễn ở tầng schema, không chỉ tầng code.
--
-- Migration này CHỈ tạo hạ tầng mới, không sửa/di trú bất kỳ bảng dữ liệu hiện có nào
-- (donations, profiles, profile_btc_aux_addresses...). Chưa có consumer nào được trỏ sang
-- đây — đó là việc của Phase 3.

-- ────────────────────────────────────────────────────────────────────────────
-- 0. btc_normalize_address — canonical hoá địa chỉ cho lưu/so khớp.
--
-- QUAN TRỌNG: khác với norm()/normalizeBtcAddr() rải rác trong scanner hiện có (toLowerCase
-- vô điều kiện), hàm này CHỈ lowercase địa chỉ bech32 (bc1q.../bc1p..., case-insensitive theo
-- BIP-173). Địa chỉ legacy base58 (1.../3...) case-SENSITIVE — lowercase vô điều kiện sẽ tạo
-- ra một địa chỉ khác/không hợp lệ, và làm sai lệch bước verify chữ ký BIP-322 (verify theo
-- đúng chuỗi gốc). Địa chỉ legacy được giữ nguyên (chỉ trim).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.btc_normalize_address(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_address ~* '^bc1[a-z0-9]+$' THEN lower(btrim(p_address))
    ELSE btrim(p_address)
  END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. btc_address_ownership_history — SSOT sở hữu-theo-thời-gian (giải quyết RC3).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.btc_address_ownership_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address               text NOT NULL,
  user_id               uuid NOT NULL REFERENCES public.profiles(id),
  valid_from            timestamptz NOT NULL DEFAULT now(),
  valid_to              timestamptz,               -- NULL = đang active
  verification_method   text NOT NULL CHECK (verification_method IN ('signature', 'admin_manual')),
  verified_at           timestamptz NOT NULL DEFAULT now(),
  evidence_ref          text,                      -- vd: chữ ký BIP-322 (base64) hoặc audit id (admin_manual)
  created_by            uuid NOT NULL REFERENCES auth.users(id),
  request_id            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT btc_ownership_valid_range CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- 1 địa chỉ tại 1 thời điểm chỉ có tối đa 1 chủ đang active.
CREATE UNIQUE INDEX idx_btc_ownership_active_unique
  ON public.btc_address_ownership_history (address)
  WHERE valid_to IS NULL;

CREATE INDEX idx_btc_ownership_address_time
  ON public.btc_address_ownership_history (address, verified_at DESC);
CREATE INDEX idx_btc_ownership_user
  ON public.btc_address_ownership_history (user_id);

GRANT SELECT ON public.btc_address_ownership_history TO authenticated;
GRANT ALL ON public.btc_address_ownership_history TO service_role;
ALTER TABLE public.btc_address_ownership_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btc_ownership_history_read_authenticated"
  ON public.btc_address_ownership_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "btc_ownership_history_service_all"
  ON public.btc_address_ownership_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. resolve_btc_owner — hàm duy nhất mọi nơi gọi qua để suy ra chủ sở hữu tại thời điểm T.
-- Không có kết quả ⇒ trả NULL. KHÔNG suy luận, KHÔNG fallback sang aux chưa verify.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_btc_owner(p_address text, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.btc_address_ownership_history
  WHERE address = public.btc_normalize_address(p_address)
    AND verified_at <= p_at
    AND (valid_to IS NULL OR valid_to > p_at)
  ORDER BY verified_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_btc_owner(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_btc_owner(text, timestamptz) TO authenticated, anon, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. claim_btc_ownership — điểm ghi DUY NHẤT vào btc_address_ownership_history.
-- Đóng active-row cũ (nếu có) rồi mở active-row mới trong cùng 1 transaction, tránh race
-- condition giữa 2 lần gọi rời rạc. Chỉ service_role được EXECUTE — client không bao giờ
-- ghi trực tiếp; mọi ghi đều đi qua edge function đã verify chữ ký/quyền admin trước.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_btc_ownership(
  p_address text,
  p_user_id uuid,
  p_verification_method text,
  p_evidence_ref text,
  p_created_by uuid,
  p_request_id text DEFAULT NULL
)
RETURNS public.btc_address_ownership_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text := public.btc_normalize_address(p_address);
  v_row public.btc_address_ownership_history;
BEGIN
  IF p_verification_method NOT IN ('signature', 'admin_manual') THEN
    RAISE EXCEPTION 'invalid verification_method: %', p_verification_method;
  END IF;
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  UPDATE public.btc_address_ownership_history
  SET valid_to = now()
  WHERE address = v_addr AND valid_to IS NULL;

  INSERT INTO public.btc_address_ownership_history (
    address, user_id, verification_method, verified_at, evidence_ref, created_by, request_id
  ) VALUES (
    v_addr, p_user_id, p_verification_method, now(), p_evidence_ref, p_created_by, p_request_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. btc_ownership_challenges — nonce BIP-322 (TTL 5 phút, single-use), cùng khuôn với
-- wallet_challenges (EVM) đã có. Khác biệt: challenge gắn với user_id đã đăng nhập (đây là
-- luồng "chứng minh sở hữu địa chỉ cho tài khoản đang có", không phải luồng login).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.btc_ownership_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  address       text NOT NULL,
  nonce         text NOT NULL UNIQUE,
  message       text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_btc_ownership_challenges_nonce ON public.btc_ownership_challenges(nonce);
CREATE INDEX idx_btc_ownership_challenges_expires ON public.btc_ownership_challenges(expires_at);
CREATE INDEX idx_btc_ownership_challenges_user ON public.btc_ownership_challenges(user_id);

GRANT ALL ON public.btc_ownership_challenges TO service_role;
ALTER TABLE public.btc_ownership_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access to btc_ownership_challenges"
  ON public.btc_ownership_challenges FOR ALL USING (false);
