# G2 · DISCOVERY_SPEC — `btc-aux-discovery-v2`

**Spec-only.** Thay `hd_input_back` đã freeze vĩnh viễn.

## 1. Vì sao tách khỏi scanner
- RC-10 gốc: `hd_input_back` học từ **input** khi thấy input không map user → gán bừa cho sender_user hiện tại → import ví exchange.
- Bài học: **discovery phải là job riêng, có guard, không chạy trong hot path scanner.**

## 2. Nguồn học duy nhất: change output
- Chỉ học từ **vout được xác định là change** (theo rule G1 §4):
  - Address là 1 trong input addresses (return-to-sender pattern), HOẶC
  - Amount lẻ (không round) + vout index cuối cùng + không map user nào khác.
- KHÔNG học từ input side.
- KHÔNG học từ vout thường (dễ nhầm recipient thật).

## 3. Guard trước khi insert `btc_ownership_snapshot`
Trước khi ghi 1 address làm aux của user X, bắt buộc:

| Guard | Ngưỡng | Vi phạm |
|---|---|---|
| tx_count on-chain | ≤ 20 | → review queue reason `hd_change_needs_verify` |
| funded_sum on-chain | ≤ 1 BTC | → review queue |
| Không nằm trong Class A blacklist (77 exchange addr) | | → reject hoàn toàn |
| Không nằm trong Class B suspect (74 addr) | | → review queue |
| Address chưa thuộc user khác trong snapshot | | → reject + alert conflict |
| User không phải Father/treasury entity | | → review queue reason `father_aux_manual` |

Pass hết → insert với `source='hd_change_verified'`, `integrity_status='ok'`, kèm snapshot `tx_count_at_verify` + `funded_btc_at_verify`.

## 4. Father / treasury policy (Cha chốt)
- User Father: **skip auto-discovery hoàn toàn**. Bất kỳ change output nghi là Father → review queue reason `father_aux_manual`.
- Treasury entity: tương tự, tag evidence `treasury_flow`.

## 5. Schedule
- Cron hourly, batch ≤ 200 tx / lần.
- Chỉ quét tx mới trong 24h qua (mempool.space `/address/:addr/txs`).
- Priority queue: user có `light_action` gần đây trước.

## 6. Review queue workflow
1. Job insert vào `btc_review_queue` với `suggested_verdict` (AI auto-suggest).
2. Admin dashboard (G7) list các row `pending`.
3. Cha / admin duyệt: approve → job apply vào `btc_ownership_snapshot`; reject → mark rejected, không học.
4. **AI KHÔNG auto-apply verdict** (Cha chốt).

## 7. Re-verification 995 address cũ
- Không re-verify toàn bộ ngay.
- Cron phụ chạy hàng tuần: lấy các address `source='hd_change_auto'` có `tx_count > 20` HOẶC `funded > 1 BTC` (theo policy Cha) → đưa vào `btc_review_queue` reason `hd_change_needs_verify`.
- Trong khi chờ verdict: parser v2 KHÔNG tin các address này (integrity=needs_review) → không dùng để resolve.

## 8. Không được làm
- ❌ Học từ input side (RC-10).
- ❌ Học Father / treasury aux.
- ❌ Học address nằm trong Class A blacklist.
- ❌ Auto-apply verdict.
- ❌ Insert vào `profile_btc_aux_addresses` (bảng deprecated).
