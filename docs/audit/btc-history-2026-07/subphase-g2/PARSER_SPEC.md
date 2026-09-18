# G2 · PARSER_SPEC — `scan-btc-transactions-v2`

**Spec-only.** Không code ở G2.

## 1. Pipeline 5 bước
```
mempool.space raw tx
  → [1] fetch + cache
  → [2] ownership resolve (pure function)
  → [3] per-vout classify (rules §4 spec G1)
  → [4] flow synthesis (per tx)
  → [5] persistence upsert vào btc_tx_semantic
```

## 2. Ownership resolver (pure function)
`resolveOwner(address, ctx) → { user_id | null, source, confidence }`

Thứ tự tra cứu (early return khi hit):
1. `custodial_wallets` → source=`custodial`, confidence=1.0
2. `profiles.btc_address` (lowercase) → source=`profile_primary`, confidence=1.0
3. `btc_ownership_snapshot WHERE integrity_status='ok'` → source snapshot, confidence=0.9
4. return `{null, 'unknown', 0}`

**KHÔNG học aux trong runtime.** Discovery là job riêng (`DISCOVERY_SPEC.md`).
**KHÔNG đọc** `profile_btc_aux_addresses` — deprecated.

## 3. Per-vout classify (theo spec G1 §4)
Với mỗi `vout[i]`:

```
input_owners  = set(resolveOwner(addr).user_id for addr in vin addresses) - {null}
output_owner  = resolveOwner(vout[i].address).user_id
sender_user   = single element of input_owners if |input_owners|==1 else null
recipient     = output_owner
recipient_addr∈ vin addresses  → is_change=true
recipient == sender_user       → is_self_transfer=true
sender or recipient ∈ treasury/father set → is_treasury=true
|input_owners| > 1             → is_coinjoin=true
```

Bảng quyết `flow_type`:
| Điều kiện | flow_type |
|---|---|
| is_coinjoin | `coinjoin_holdout` (KHÔNG donation) |
| is_treasury | `treasury_flow` |
| is_self_transfer or is_change | `self_transfer` / `change` |
| sender_user và recipient nội bộ khác nhau | `internal_donation` |
| sender_user nội bộ, recipient=null | `external_out` |
| sender_user=null, recipient nội bộ | `external_in` |
| còn lại | bỏ qua (không phải giao dịch nội bộ) |

## 4. Chain family enforcement
- `tx_hash` match `^[0-9a-f]{64}$` VÀ không prefix `0x` VÀ tồn tại trên BTC chain → `chain_family='bitcoin'`.
- `0x…` (66 hex) → parser BTC không đụng; thuộc scanner EVM.
- Bất kỳ row nào parser v2 ghi phải là `bitcoin`; không cho pass-through label cũ.

## 5. Idempotency
- Upsert key: `(tx_hash, vout_index, recipient_address)`.
- Nếu row đã có với cùng `classifier_version` → skip.
- Nếu row cũ có `classifier_version < current` → update in-place + bump `classified_at`.

## 6. Coinjoin guard (Cha chốt)
```
if |input_owners| > 1:
    for each vout:
        insert btc_tx_semantic(flow_type='coinjoin_holdout', is_coinjoin=true)
    enqueue btc_review_queue(tx_hash, reason='coinjoin_multi_owner', evidence=<vin+vout owners>)
    → KHÔNG sinh donation, KHÔNG sinh wallet_transfer
```

## 7. `hd_change_auto` handling
- Chỉ đọc từ `btc_ownership_snapshot` với `integrity_status='ok'`.
- Address có `integrity_status='needs_review'` → resolver trả `unknown` → không sinh internal_donation → tự động vào `external_in/out`.
- Không có fallback lookup vào bảng `profile_btc_aux_addresses` cũ.

## 8. Feature flag
- `system_config.scan_btc_v2_enabled` (bool, default false).
- Scanner đọc flag mỗi lần chạy (không cache).
- Dark launch: cả v1 và v2 chạy song song; v2 chỉ ghi `btc_tx_semantic`, không đụng `donations`/`wallet_transfers`.
- Sau cutover G6: v1 tắt, v2 dual-write cả `btc_tx_semantic` + `donations`/`wallet_transfers` với `classifier_version='v2'` + `vout_index`.

## 9. Fetch policy
- mempool.space, concurrency ≤ 3.
- Retry 3 lần backoff 2s / 5s / 10s cho HTTP 429.
- Cache raw JSON dạng `btc_raw_tx_cache(tx_hash, json, cached_at)` (bảng phụ trợ, TTL 30d).
- KHÔNG refetch nếu cache còn hạn.
- Ghi fetch error vào `btc_review_queue` reason `ambiguous_ownership` với evidence lỗi.

## 10. Không được làm
- ❌ Học aux trong runtime.
- ❌ Insert vào `profile_btc_aux_addresses`.
- ❌ Ghi `chain_family` khác `bitcoin`.
- ❌ Sinh donation cho coinjoin.
- ❌ Sinh donation nếu ownership resolver trả `unknown` cho cả 2 phía.
- ❌ Trust label cũ (`sender_id` từ v1) — mọi thứ resolve lại từ on-chain.
