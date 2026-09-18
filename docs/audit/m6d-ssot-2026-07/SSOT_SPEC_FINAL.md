# M6D · SSOT_SPEC FINAL (Revision 2)

Ngày: 2026-07-01 · Trạng thái: **Spec finalized** — implement khi Cha duyệt M6E.

Bản gốc: `SSOT_SPEC.md`. Bản này ghi các quyết định đã chốt.

---

## 1. Chính sách `max_single_usd` (chống outlier)

Không hardcode trong RPC. Cấu hình admin qua `tokens_registry`:

```sql
ALTER TABLE public.tokens_registry
  ADD COLUMN IF NOT EXISTS max_single_usd    numeric,
  ADD COLUMN IF NOT EXISTS default_price_usd numeric,
  ADD COLUMN IF NOT EXISTS price_source      text,      -- 'coingecko' | 'admin_manual' | 'stable'
  ADD COLUMN IF NOT EXISTS is_leaderboard_eligible boolean NOT NULL DEFAULT true;
```

Đề xuất giá trị khởi tạo:

| Token | max_single_usd | Ghi chú |
|---|---:|---|
| USDT | 1.000.000 | sanity limit, không outlier |
| USDC | 1.000.000 | sanity limit |
| BTC  | 5.000.000 | 1 BTC ≈ 65k, cho phép giao dịch cực lớn |
| BNB  | 500.000 | |
| ETH  | 500.000 | |
| CAMLY | **10.000** | chống outlier phantom $359M |
| FUN (mainnet) | 100.000 | |
| FUN (testnet 97) | NULL (bị loại bằng chain filter) | |
| TONCOIN | 100.000 | |

Row có `amount_usd > tokens_registry.max_single_usd` ⇒ `is_eligible_benefactor = false` + ghi audit `benefactor_outlier_flagged`.

## 2. Chính sách Testnet

- `chain = 'bsc_testnet'` KHÔNG có trong leaderboard.
- FUN testnet: `amount_usd = 0`, `price_source = 'ignored_testnet'`.
- View `v_unified_statistics` vẫn hiển thị row testnet (để user thấy lịch sử), nhưng cột `is_eligible_benefactor = false` và `amount_usd = 0`.
- UI có tab riêng "Testnet" nếu cần, không mix vào production stats.

## 3. Chính sách Historical Price (đã chốt)

Ưu tiên theo thứ tự:

1. **`donations.price_usd_at_donation` snapshot** — nếu tồn tại và hợp lệ (`>0` cho non-stable, `=1` cho stable).
2. **Stable coin cố định**: USDT/USDC/BUSD/DAI luôn = $1.
3. **CoinGecko historical** (backfill only): dùng khi snapshot sai/thiếu, gọi qua job admin, KHÔNG realtime trong view.
4. **`tokens_registry.default_price_usd`** — fallback cuối cùng cho token không có oracle.
5. Nếu tất cả fail: `price_source = 'unpriced'`, `amount_usd = NULL`, `is_eligible_benefactor = false`.

Ràng buộc: **KHÔNG dùng giá hiện tại cho giao dịch cũ**. Mọi RPC leaderboard đọc `donations.price_usd_at_donation` trước.

## 4. Chính sách Swap

- KHÔNG tính vào benefactor leaderboard (`is_eligible_benefactor = false`).
- CÓ tính vào `get_unified_summary_v2` khi user filter `tx_type = 'swap'`.
- `by_type` breakdown trong summary tách rõ 4 nhóm: `gift`, `transfer`, `external`, `swap`.
- Swap 2 leg tính là 2 row riêng biệt (đúng như view `v_unified_transactions` đã apply).

## 5. Contract RPC final

Giữ nguyên 4 RPC như spec gốc, thêm ràng buộc:

```
get_unified_summary_v2(_user_id, _from, _to, _tx_type[])
  → by_type: [{ tx_type, direction, amount_usd_sum, tx_count }, ...]
  → gift/transfer/external/swap tách riêng.

get_unified_leaderboard(_scope, _from, _to, _limit)
  → chỉ đọc row có is_eligible_benefactor = true.
  → không tính testnet, không tính outlier > max_single_usd.

get_unified_global_stats(_from, _to)
  → tổng USD chỉ từ donations gift với is_eligible_benefactor = true.

get_unified_token_breakdown(_scope, _user_id, _from, _to)
  → group by (token_symbol, chain, direction, tx_type).
```

## 6. Câu hỏi cần Cha xác nhận trước M6E

1. Bảng `max_single_usd` ở mục 1 — Cha đồng ý các threshold khởi tạo không?
2. FUN mainnet đã list ở đâu? Nếu chưa có giá công khai, `default_price_usd` sẽ dùng bao nhiêu?
3. Migration `tokens_registry` mới thêm cột — có cần backfill 9 dòng CAMLY sai giá luôn không (audit benefactors-2026-07)?

Chờ Cha ra lệnh cho M6E.
