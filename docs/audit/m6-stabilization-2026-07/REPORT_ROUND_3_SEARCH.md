# Search Round 3 — Normalize + Anti-Expansion

Ngày: 2026-07-02  
Tác giả: Angel FUN Profile  
Phạm vi: `get_unified_transactions`, `get_unified_counterparties`  
KHÔNG đụng: `get_unified_summary`, view `v_unified_transactions_primary`, FE.

## 1. Mục tiêu

1. Tìm được bằng prefix / middle / suffix của tx_hash và địa chỉ ví (EVM + BTC).
2. Không cần user nhập `0x`.
3. Sửa lỗi: search địa chỉ BTC/EVM không được "phình" ra toàn bộ lịch sử user sở hữu ví đó.
4. Username / display_name / full_name / token / memo giữ nguyên hành vi.
5. Áp cùng predicate cho `get_unified_transactions` + `get_unified_counterparties`.

## 2. SQL diff (rút gọn)

Xem migration `20260702-000155_614049` (patch cuối) — điểm cốt lõi:

```sql
-- Normalize
_s_low   := lower(_search);
_s_norm  := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
_is_alnum := _s_norm ~ '^[a-z0-9]+$';
_addr_ok    := length(_s_norm) >= 6;   -- contains
_addr_prefix := length(_s_norm) >= 4;  -- prefix

-- (A) ADDRESS/HASH — chỉ field trực tiếp trên row
_is_alnum AND (
  (_addr_ok AND (
     lower(v.tx_hash)           LIKE '%'||_s_norm||'%' OR
     lower(v.sender_address)    LIKE '%'||_s_norm||'%' OR
     lower(v.recipient_address) LIKE '%'||_s_norm||'%'
  ))
  OR
  (NOT _addr_ok AND _addr_prefix AND (
     lower(v.tx_hash)           LIKE _s_norm||'%' OR
     lower(v.sender_address)    LIKE _s_norm||'%' OR
     lower(v.recipient_address) LIKE _s_norm||'%'
  ))
)
-- (B) TEXT — username/display_name/full_name/memo/token
OR ( ... ILIKE '%'||_s_low||'%' ... )
```

Điểm khác so với migration trước:

- **Xoá toàn bộ** đối sánh `own.public_wallet_address`, `own.custodial_wallet_address`, `own.external_wallet_address`, `own.btc_address`, và các cột `cpt.*` tương đương trong predicate search ⇒ bịt bug BTC/EVM expand.
- Bỏ nhánh `_is_hex_prefix` cứng phải bắt đầu `0x` — dùng chung `_is_alnum` (a-z0-9) ⇒ suffix 6 ký tự (kể cả base58/bech32 của BTC) match trực tiếp.
- Gate độ dài: `<4` không search address (tránh full scan), `4–5` chỉ prefix, `≥6` contains.

## 3. Vì sao chọn 4 & 6

- **4 ký tự (hard min)**: `16^4 = 65 536` tổ hợp hex ⇒ prefix scan không quá thưa; ngưỡng an toàn tối thiểu.
- **6 ký tự (contains)**: đủ hiếm để `%kw%` scan bảng vài trăm nghìn dòng vẫn cho vài chục kết quả. Legacy UI hiển thị "…89ABCDEF" (last 8) nên 6 khớp thói quen user recall.
- 5 ký tự bị đẩy về prefix để không mở `%kw%` quá sớm — nếu Cha thấy quá bảo thủ, đổi 1 hằng `_addr_ok := _s_len >= 5` trong migration nhỏ.

## 4. Validation report

### 4.1 Correctness (7/7 PASS)

Bảng tx mẫu (donation gift, direction=out):
- EVM tx: `0xd69a1de8...ceeb7f973`, sender `0x34932025...ba4cbe55`, recipient `0xf6dbe280...6b7ed47d`
- BTC row: sender `bc1qe4nzjar7enw82h6fjnny3z7dx9rezgufg4lxkr`

| # | Keyword | Kỳ vọng | Thực tế | Verdict |
|---|---|---|---|---|
| 1 | `b7f973` (suffix hash 6) | ≥1 | 1 | ✅ |
| 2 | `6b7ed47d` (suffix EVM addr 8) | 42 | 42 | ✅ |
| 3 | `0xd69a1de8...ceeb7f973` (full tx) | 1 | 1 | ✅ |
| 4 | `bc1qe4nzjar7enw82h6fjnny3z7dx9rezgufg4lxkr` (full BTC) | 1 | 1 | ✅ |
| 5 | `g4lxkr` (suffix BTC 6, non-hex) | 1 | 1 | ✅ |
| 6 | `0xf6dbe280...b7ed47d` (full EVM) | 42 | 42 | ✅ |
| 7 | `6b7ed47d` (suffix EVM 8 lần 2) | 42 | 42 | ✅ |

### 4.2 Anti-expansion (P2)

Query raw view (không qua profile):
```sql
SELECT COUNT(*) FROM v_unified_transactions_primary v
WHERE ... AND (
  lower(v.tx_hash) LIKE '%f6dbe280...6b7ed47d%'
  OR lower(v.sender_address) LIKE '%f6dbe280...6b7ed47d%'
  OR lower(v.recipient_address) LIKE '%f6dbe280...6b7ed47d%'
)
-- kết quả: 42
```
RPC `get_unified_transactions('global', ..., '0xf6dbe280...6b7ed47d')` → **42** ✅.

Nếu còn expand qua `profile.*_wallet_address`, số sẽ lớn hơn (mọi row user sở hữu ví đó). Confirmed **không expand**.

### 4.3 Regression giữ nguyên

| # | Keyword | Kỳ vọng | Verdict |
|---|---|---|---|
| R1 | `angel` (username 5 char) | text search, không đụng address | ✅ 50 (page) |
| R2 | `BTC` (token, 3 char) | `upper(token_symbol)=upper(_s)` | ✅ 50 (page) |
| R3 | `0xd69a` (prefix 0x, 4 hex sau strip) | prefix match | ✅ 1 |
| R4 | `0f3b90f9` (middle hash 8) | contains hash | ✅ 1 |
| R5 | `bc1qe4nz` (prefix BTC 8) | contains addr | ✅ 1 |

### 4.4 Performance

Bảng nguồn (`v_unified_transactions_primary`) hiện có ~120k row visible cho scope=global (donations gift).

| Query | Thời gian |
|---|---|
| Suffix hex 6 (`b7f973`) | ~1.75s |
| Suffix hex 8 (`6b7ed47d`) | ~1.75s |
| Full tx_hash EVM | ~1.73s |
| Full BTC address | ~1.79s |
| Suffix BTC 6 (`g4lxkr`) | ~2.16s |
| Username `angel` | ~2.13s |
| Token `BTC` | ~2.16s |
| Full EVM addr | ~1.83s |
| Prefix `0xd69a` | ~1.80s |
| Middle `0f3b90f9` | ~1.75s |

**Tất cả đều > 700ms**. Correctness pass, nhưng cần mở phase index — xem §5.

## 5. Phase 4 (đề xuất, CHƯA làm)

Trigger perf: `v_unified_transactions_primary` là view union nhiều bảng, không có index trực tiếp cho `ILIKE '%kw%'`. Đề xuất sắp xếp priority:

1. **`pg_trgm` extension + GIN trigram index** trên `donations.tx_hash`, `donations.sender_address`, `donations.recipient_address`, `wallet_transfers.tx_hash`, `transactions.tx_hash`, `transactions.from_address`, `transactions.to_address`. Contains search hạ về ~50–150ms.
2. Nếu Cha muốn thêm nhẹ hơn: **generated reversed columns** `tx_hash_rev`, `addr_rev` + B-Tree index để suffix search dùng `LIKE 'reversed_prefix%'`. Nhược điểm: chỉ tối ưu suffix, không tối ưu middle.
3. **Materialized view** cho `/donations` global (top 100k gần nhất) refresh 5 phút — thay contains trên view union bằng contains trên bảng physical.

Bé đề xuất chọn **Phương án 1 (pg_trgm)**: 1 migration nhỏ, tương thích ngược, tối ưu cả prefix + middle + suffix.

## 6. Verdict

- Correctness: **PASS 7/7**
- Anti-expansion (BTC/EVM): **PASS**
- Regression (username/token/prefix/middle): **PASS 5/5**
- Perf: **CẦN Phase 4** — mở phase riêng, chưa blocker cho M7 nếu Cha chấp nhận độ trễ 1.7–2.3s hiện tại.
- Typecheck/build: FE không thay đổi ⇒ N/A.

Không sửa UI, không đổi contract RPC, không đổi summary. Đúng đúng scope Cha duyệt.
