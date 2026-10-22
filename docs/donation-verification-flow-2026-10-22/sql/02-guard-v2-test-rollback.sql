-- 02 — BỘ TEST GUARD V2 TRONG GIAO DỊCH ROLLBACK (không để lại dấu vết)
-- Chạy SAU file 01, bởi người thi hành có quyền, trong một phiên SQL duy nhất.
-- Cách chạy: thay '<TEST_PROFILE_ID>' bằng id của MỘT profile thử (nên tạo profile rác riêng cho test,
-- không dùng tài khoản thật của thành viên). Toàn bộ nằm trong BEGIN ... ROLLBACK.
-- Kỳ vọng: mọi khối DO đều RAISE NOTICE 'PASS ...'; khối ca xấu dùng BEGIN..EXCEPTION để tự kiểm.
-- Nếu bất kỳ PASS nào thiếu, DỪNG — không deploy tiếp, báo lại vào hộp thư ai-van.md.

BEGIN;

-- Giả lập phiên client: role authenticated + danh tính test
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '<TEST_PROFILE_ID>', 'role', 'authenticated')::text, true);

-- Ca 1: client cố ghi confirmed + tự khai amount_usd -> phải bị ép về pending_verification, amount_usd NULL
DO $$
DECLARE v_status text; v_usd numeric; v_since timestamptz;
BEGIN
  INSERT INTO public.donations (sender_id, recipient_id, amount, token_symbol, chain_id, chain_family, tx_hash, status, amount_usd)
  VALUES ('<TEST_PROFILE_ID>', '<TEST_PROFILE_ID>', '5', 'USDT', 56, 'evm',
          '0x' || repeat('a', 64), 'confirmed', 12345)
  RETURNING status, amount_usd, pending_verification_since INTO v_status, v_usd, v_since;
  IF v_status = 'pending_verification' AND v_usd IS NULL AND v_since IS NOT NULL THEN
    RAISE NOTICE 'PASS 1: confirmed bi ep ve pending_verification, amount_usd bi gat, co moc cho';
  ELSE
    RAISE EXCEPTION 'FAIL 1: status=% amount_usd=% since=%', v_status, v_usd, v_since;
  END IF;
END $$;

-- Ca 2: client ghi hash EVM sai định dạng -> phải bị chặn
DO $$
BEGIN
  BEGIN
    INSERT INTO public.donations (sender_id, recipient_id, amount, token_symbol, chain_id, chain_family, tx_hash, status)
    VALUES ('<TEST_PROFILE_ID>', '<TEST_PROFILE_ID>', '5', 'USDT', 56, 'evm', '0xZZZ-not-a-hash', 'pending_verification');
    RAISE EXCEPTION 'FAIL 2: hash sai dinh dang van ghi duoc';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 2: hash EVM sai dinh dang bi chan (%)', SQLERRM;
  END;
END $$;

-- Ca 3: client UPDATE cố đổi status/amount_usd của dòng chờ -> các trường kết luận phải giữ nguyên
DO $$
DECLARE v_status text; v_usd numeric;
BEGIN
  UPDATE public.donations
     SET status = 'confirmed', amount_usd = 999999, message = 'test update'
   WHERE sender_id = '<TEST_PROFILE_ID>' AND tx_hash = '0x' || repeat('a', 64)
  RETURNING status, amount_usd INTO v_status, v_usd;
  IF v_status = 'pending_verification' AND v_usd IS NULL THEN
    RAISE NOTICE 'PASS 3: UPDATE phia client khong doi duoc truong ket luan';
  ELSE
    RAISE EXCEPTION 'FAIL 3: status=% amount_usd=%', v_status, v_usd;
  END IF;
END $$;

-- Ca 4: luồng 'failed' hợp lệ của client (ví báo thất bại) vẫn ghi được như trước
DO $$
BEGIN
  INSERT INTO public.donations (sender_id, recipient_id, amount, token_symbol, chain_id, chain_family, tx_hash, status)
  VALUES ('<TEST_PROFILE_ID>', '<TEST_PROFILE_ID>', '5', 'USDT', 56, 'evm', '0x' || repeat('b', 64), 'failed');
  RAISE NOTICE 'PASS 4: dong failed hop le van ghi duoc';
END $$;

RESET ROLE;
ROLLBACK;
