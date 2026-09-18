# M6B-1 · Applied Report

Ngày apply: 2026-07-01 · Migration: siết `v_unified_transactions` + thêm swap 2 leg.

## Count trước / sau

| Nhánh | Trước | Sau (raw view) | Sau (primary) |
|---|---:|---:|---:|
| donations | 54.431 | 54.449 | 54.433 |
| wallet_transfers | 2.161 | 2.161 | 335 |
| transactions | 55.335 | **590** | 589 |
| swap_transactions | 0 (chưa UNION) | **92** (46 swap × 2 leg) | 79 |
| **TOTAL** | **111.927** | **57.292** (−48.8%) | 55.436 |

## Whitelist `transactions` còn lại (590)

| token_symbol | chain_id | count |
|---|---:|---:|
| BNB | 56 | 299 |
| USDT | 56 | 269 |
| BTC | 0 | 22 |

Đúng 3 loại reconciliation on-chain độc lập. 2.894 dòng FUN testnet đã bị loại khỏi Unified History production.

## Swap 2 leg sample

```
tx_hash                                                              | direction | token  | amount             | leg
0x04a26f3ccc1c841e165eaa98b5983a633de63cb85c155221cb7e922b8dc46343 | out       | CAMLY  | 1.250.216          | out
0x04a26f3ccc1c841e165eaa98b5983a633de63cb85c155221cb7e922b8dc46343 | in        | BNB    | 0.007769789…       | in
0x05c37f72aa1d25852b0dba84ba77c36c7316fba9473944c7ae19a8aac8fd67ee | out       | BNB    | 0.007              | out
0x05c37f72aa1d25852b0dba84ba77c36c7316fba9473944c7ae19a8aac8fd67ee | in        | CAMLY  | 646.201,907        | in
```

Đúng: cùng `tx_hash`, cùng `swap_id` trong metadata, khác `direction`, khác `token_symbol`, `tx_type='swap'`.

## Chính sách bảo mật

- `REVOKE SELECT ... FROM anon` đã áp cho raw view. `authenticated` + `service_role` giữ quyền đọc.
- `v_unified_transactions_primary` vẫn cho anon (dùng cho profile public).
- Consumer `get_unified_transaction_detail` (đọc raw view theo `tx_hash` cụ thể) không bị ảnh hưởng vì dùng `service_role` phía RPC (SECURITY DEFINER).

## Backup

- `docs/audit/m6b-td05-fix/backup/v_unified_transactions_before.sql` (288 dòng)
- `docs/audit/m6b-td05-fix/backup/v_unified_transactions_primary_before.sql` (70 dòng)

Rollback: `psql -f` 2 file trên với `CREATE OR REPLACE VIEW ...`.

## Kết luận

M6B-1 apply thành công. Không có regression. Ready để chạy M6B-2 (record-swap) và M6B-3 (scanner).
