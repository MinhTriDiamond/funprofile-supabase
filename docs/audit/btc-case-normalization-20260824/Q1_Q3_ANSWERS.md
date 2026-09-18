# BTC case-normalization — trả lời câu 1–3 (AUDIT ONLY, không sửa)

## 1. Hàm chuẩn — ĐÚNG RULE

DB `public.btc_normalize_address` (migration `20260823124512_…`, dòng 24–34):

```sql
SELECT CASE
  WHEN p_address ~* '^bc1[a-z0-9]+$' THEN lower(btrim(p_address))
  ELSE btrim(p_address)
END;
```

FE mirror `src/lib/btc/btcOwnershipResolver.ts:24-27`:

```ts
export function btcNormalizeAddress(address: string): string {
  const trimmed = (address ?? "").trim();
  return /^bc1[a-z0-9]+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}
```

⇒ Cả 2 đều: bech32 → lowercase; legacy `1…`/`3…` → **giữ nguyên case, chỉ trim**. Đúng rule,
2 bên khớp nhau.

## 2. 7 vị trí lowercase — phân 2 nhóm

**Nhóm A — CÓ ghi ngược vào DB (P0):**
| Vị trí | Biến | Cột DB bị ghi |
|---|---|---|
| `wallet-reconciliation-cron/index.ts:189` | `fromAddr` | `transactions.from_address` (row `recRow`, insert dòng ~236) + `donations.sender_address` (insert dòng ~268) |
| `wallet-reconciliation-cron/index.ts:193` | `toAddr` | `transactions.to_address` + `donations.recipient_address` |

Ngoài ra `toAddr`/`fromAddr` còn được ghi vào shadow-log `address` / `raw_address_legacy_side`
(dòng 197–222) và `wallet_reconciliation_findings.address`.

**Nhóm B — chỉ in-memory để so khớp (P1):**
| Vị trí | Mục đích |
|---|---|
| `:150` `p.btc_address.toLowerCase()` | key của `btcMap` |
| `:151` `a.address.toLowerCase()` | key của `btcMap` (aux) |
| `:164` `a.address.toLowerCase()` | `fatherBtcAddrs` |
| `:165` `p.btc_address?.toLowerCase()` | `fatherMainBtc` |
| `useWatchedWallets.ts:54` | key `seen` dedupe; địa chỉ push ra ngoài là **bản gốc** (dòng 67/72), không lưu DB |

Lưu ý hệ quả nhóm B: `btcQueue` lấy từ `btcMap.keys()` (đã lowercase) rồi gọi
`mempool.space/api/address/<addr>/txs` ⇒ với ví legacy, URL sai địa chỉ ⇒ **bỏ sót quét** (không
ghi sai dữ liệu, nhưng mất tx). Đây là lý do nhóm B không hoàn toàn vô hại.

## 3. Hai địa chỉ hỏng — dấu vết giao dịch

| Nguồn | Số dòng khớp 2 địa chỉ |
|---|---|
| `donations.sender_address` / `recipient_address` | 0 / 0 |
| `transactions.from_address` / `to_address` | 0 / 0 |
| `wallet_transfers.counterparty_address` | 0 |
| `profile_btc_aux_addresses` (2 user) | 0 |
| `donations` theo `sender_id`/`recipient_id` của 2 user | 0 |

⇒ **Không có giao dịch nào bị match sai; cũng không có tx nào ghi nhận được cho 2 user này.**
Không thể tra Mempool/Blockstream vì chuỗi đang lưu không hợp lệ Base58 (mất checksum) và không
có bản gốc ở bất kỳ nguồn nào trong DB.

Nguồn gốc giá trị hỏng (`profiles_wallet_audit`):
| id | user | changed_at | old_value | new_value |
|---|---|---|---|---|
| 4907 | phongyknb984t341b | 2026-06-16 17:58:36Z | NULL | `178qtdaz22y8mzdhgmqq6nso1467dgasvy` |
| 4978 | angelthaihoa | 2026-06-25 03:47:46Z | NULL | `3jrhcdbargfib8mjmapsm3cgxur3ev4zb1` |

Cả 2 là **lần khai đầu tiên** (`old_value = NULL`) và **đã lowercase ngay tại thời điểm ghi**
(qua PostgREST) ⇒ dữ liệu bị hạ hoa **trước khi tới DB**, không phải do cron/backfill sửa sau.
Đáng chú ý: `EditProfile.tsx:308` validate bằng regex Base58 case-sensitive (loại `0`,`l`,`o`)
⇒ 2 chuỗi này **không thể đi qua** form Edit Profile hiện tại. Đường ghi thực tế chưa xác định
được; đây là câu hỏi mở, chưa suy diễn.

**Chưa làm gì với 2 tài khoản này** (nguyên tắc 7) — chờ Cha quyết: (i) xoá `btc_address` về NULL
và nhờ user khai lại, hay (ii) giữ nguyên + gắn cờ review.
