# Roadmap

## Đang mở
- [ ] Cutover: deploy Batch 2-4 edge functions lên project test `xiqzryezjttjonpqbvci` — **CHẶN**: bé chỉ có quyền trên project hiện tại, không deploy chéo project được; cần Cha/CTO chạy CLI hoặc mở phiên làm việc trong project test
- [ ] Cutover: mở ticket Lovable Support xin lịch export baseline — **CHẶN**: bé không mở ticket được; đề xuất xin sau khi Batch 2-4 deploy xong (cooldown 24h/lần, chỉ xin 1 lần)
- [ ] Luồng BNB gốc của cron tụt ~9.700 block (~8h chuỗi) — đề xuất chuyển native sang Alchemy Transfers (category `external`)
- [ ] Sửa toàn bộ lỗi Deno typecheck edge functions (~200 lỗi / 76 file, nợ kỹ thuật tồn từ trước) — /tmp/observability/build-errors.log (đã xử lý 3 file sumsub: TS2339 `e?.message`)
- [ ] Lô 2 — Nhóm B (4 dòng CAMLY bị gắn nhãn USDT: 747d59b7, 045e89f1, 8aa45de1, 4b2d8121) — đã đủ bằng chứng on-chain, chờ CTO duyệt Confirm
- [ ] Lô 2 — Nhóm C (4 dòng token rác BNB ETF/MRVL/GME/MAVRO) — chờ CTO duyệt cơ chế ẩn (đề xuất cột `is_junk_token`), chưa áp dụng

- [ ] Dọn biến chết `_is_admin` trong `get_unified_transaction_detail` + code chết `_public_only` (không ảnh hưởng hành vi)
- [ ] 353 issue security linter (tồn từ trước, không do migration mới): 7 security-definer view, 163 anon-executable, 181 authenticated-executable, 1 RLS no policy, 1 extension in public
- [ ] Migration Supabase Phần B: **CHƯA BẮT ĐẦU** (chỉ có A2 inventory read-only 27/08; chưa export/import project test, chưa deploy edge theo batch)
- [ ] P2: tie-break bất định trong v_unified_transactions_primary

## Đã đóng
- Backfill vùng mù 31/08→15/09: ghi thật 111 dòng (59 ví ngoài + 52 nội bộ), đối chiếu 100%, gồm 300M CAMLY vào funtreasury ✅
- Verify cờ khoá tạo tài khoản mới (4 luồng edge + Auth API + Google), xoá sạch 6 tài khoản test ✅
- Viết lại CUTOVER CHECKLIST v2 (bỏ freeze 24-30h) ✅
- Kiểm kê secret 59/59 phân loại đủ 4 nhóm ✅
- M6E: B1, B7a, B2, B3, B4, B5, B6 ✅ — B4 sạch sau 48h, `get_token_reference_usd` đã DROP
- Mục 3 (Phần 4): `get_user_gift_breakdown` v2 — chỉ đọc donations, dùng `donations.amount_usd` historical ✅
- Phần 3: sửa 2 dòng transactions của @father (CAMLY mislabel + BNB dust) ✅
- Phần 5: `_is_admin` trong `get_unified_transaction_detail` không gate gì → không cần sửa ✅
