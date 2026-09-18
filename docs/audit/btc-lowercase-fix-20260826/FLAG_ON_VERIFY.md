# Bật cờ `btc_shadow_write_enabled` — verify runtime sau vá lowercase

Thời điểm bật: **2026-08-26 17:06:11.664049+00** (`system_config.btc_shadow_write_enabled = {"enabled": true}`).

## 1. Chạy thật scan-btc-transactions

Gọi tay `POST /functions/v1/scan-btc-transactions` ngay sau khi bật cờ. Trong ~1 phút,
`btc_resolver_shadow_log` phát sinh **45 dòng mới** (`created_at > 17:06:11+00`), trong đó
**11 dòng địa chỉ legacy** (`^[13]`), **11/11 vẫn còn chữ hoa** ⇒ không có dòng nào bị hạ hoa.

## 2. Bằng chứng (3 dòng legacy mới nhất)

| created_at | address | btc_normalize_address(address) | case_preserved | raw_address_legacy_side | is_match | suspected_legacy_format_mismatch |
|---|---|---|---|---|---|---|
| 17:06:57.349871+00 | `1KT3zCYUrmQxjcveUNs1Rs7WcXDcPQZ4av` | `1KT3zCYUrmQxjcveUNs1Rs7WcXDcPQZ4av` | t | `1KT3zCYUrmQxjcveUNs1Rs7WcXDcPQZ4av` | t | f |
| 17:06:47.449258+00 | `18oajnwpAtRzKeWH7hJEhT7vDz8KoAg3Kx` | `18oajnwpAtRzKeWH7hJEhT7vDz8KoAg3Kx` | t | `18oajnwpAtRzKeWH7hJEhT7vDz8KoAg3Kx` | t | f |
| 17:06:47.446959+00 | `14HXX8ngXENMbHJKctk46XkvZozwYn3ihv` | `14HXX8ngXENMbHJKctk46XkvZozwYn3ihv` | t | `14HXX8ngXENMbHJKctk46XkvZozwYn3ihv` | t | f |

Cả 3: `address = btc_normalize_address(address)` (giữ đúng case gốc), `raw_address_legacy_side`
trùng khớp, `is_match = true`, không dòng nào bị gắn `suspected_legacy_format_mismatch`.

## 3. Ranh giới dữ liệu

- 605 dòng cũ vẫn gắn nhãn `PRE_LOWERCASE_FIX_NOT_BASELINE` — **không** tính vào cửa sổ quan sát.
- Baseline sạch bắt đầu từ `created_at > 2026-08-26 17:06:11+00`.
- Cờ đang **true**; mốc 7 ngày chính thức chờ CTO công bố.
