# PHẦN B + C — BTC: gap quét ví aux legacy & phòng thủ tầng DB (2026-08-25)

## B5. Bug lowercase tồn tại từ khi nào

`git log -S'scriptpubkey_address' -- supabase/functions/wallet-reconciliation-cron/index.ts`:

| Commit | Ngày | Ghi chú |
|---|---|---|
| `ebc11eee6` | **2026-06-21** | File được **tạo mới** — đã có `…scriptpubkey_address ?? "").toLowerCase()` ngay từ dòng đầu (:127/:130) |
| `e055b9d7a`, `d65efdeb8` | 2026-06-21 | dời dòng (:152/:155), giữ nguyên bug |
| `007426772` | 2026-06-22 | dời dòng (:184/:187), giữ nguyên bug |
| `7445da600` | **2026-08-24** | **vá** — thay bằng `btcNorm()` (chỉ hạ hoa `bc1…`) |

⇒ **Khoảng bỏ sót quét: 21/06/2026 → 24/08/2026 = 64 ngày**, áp dụng cho **mọi ví
BTC dạng legacy `1…` / P2SH `3…`** (bech32 không ảnh hưởng).

## B6. Đối chiếu chéo 355 ví aux legacy trong đúng cửa sổ bug

`profile_btc_aux_addresses` khớp `^[13]` ⇒ **355 địa chỉ, thuộc 7 user**.

| user | ví legacy | donations liên quan (mọi thời điểm) | transactions liên quan (mọi thời điểm) |
|---|---|---|---|
| angelhoangtydo | 205 | 0 | 0 |
| angelkim | 116 | 0 | 0 |
| angelthuha | 24 | 0 | 0 |
| trogiauco | 6 | 1 | 6 |
| angelanhnguyet | 2 | 0 | 3 |
| wallet_0x50ebe82ce05adf3dd | 1 | 0 | 4 |
| ngocphuong | 1 | 0 | 1 |

Trong **đúng cửa sổ bug (≥ 21/06/2026)**:
- `donations` (BTC) chạm 355 địa chỉ này: **0 dòng**
- `transactions` (BTC) chạm 355 địa chỉ này: **0 dòng**

⇒ Không có dấu hiệu donation thật được ghi nhận qua đường khác (manual/admin/backfill)
cho nhóm ví này trong cửa sổ bug. Toàn bộ 14 dòng lịch sử (1 donation + 14 tx) đều
**trước** 21/06/2026. Rủi ro tài chính ước lượng: **thấp**, nhưng đây chỉ là đối
chiếu trong DB — chưa loại trừ khả năng có tiền vào on-chain mà DB không hề biết.

## B7. Đề xuất (CHƯA chạy — chờ CTO duyệt)

**Đề xuất: CÓ, chạy 1 lượt quét bù giới hạn phạm vi**, vì đối chiếu DB không thể
chứng minh "không có tiền vào" — chỉ chứng minh "DB không có gì".

Phạm vi đề xuất:
- 355 địa chỉ aux legacy + 2 địa chỉ `profiles.btc_address` legacy (đang hỏng, xem Phần D).
- Dùng `btcNorm()` đã vá (giữ nguyên case cho `1…`/`3…`).
- Cửa sổ: 21/06/2026 → nay; **dry-run trước** (chỉ đếm & liệt kê tx phát hiện được,
  KHÔNG insert), ưu tiên 7 user nêu trên.
- Rate limit mempool.space: 355 địa chỉ × 1 request `/address/{addr}` ⇒ chia lô 20/phút
  (~18 phút), không đụng cron sản xuất.
- Sau dry-run có số liệu mới quyết định có backfill `transactions`/`donations` hay không.

## C8. Phòng thủ tầng DB cho `profiles.btc_address`

Kiểm tra runtime:

- `pg_constraint` (CHECK có chứa `btc_address`): **0 kết quả** ⇒ **KHÔNG có CHECK constraint nào**.
- Trigger đang có trên cột:
  - `trg_btc_address_lock` → `enforce_btc_address_lock()`: **kill-switch** theo
    `app_settings.btc_address_updates_enabled`; miễn trừ admin + service_role. **Không validate format.**
  - `trg_wallet_writer_guard` → `fn_wallet_writer_guard()`: audit + strict-mode writer tag. **Không validate format.**

⇒ **Xác nhận là lỗ hổng phòng thủ thật**: validate Base58/bech32 hiện chỉ tồn tại
ở form FE (`EditProfile.tsx`). Bất kỳ đường ghi nào khác (kể cả service_role, script,
edge tương lai) đều ghi được chuỗi sai định dạng — khớp đúng với 2 dòng hỏng mà
không truy được đường ghi.

### Đề xuất CHECK constraint lớp 2 (CHƯA thêm — chờ CTO duyệt vì đụng schema)

```sql
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_btc_address_format_chk
  CHECK (
    btc_address IS NULL
    OR btc_address ~ '^bc1[a-z0-9]{25,59}$'                      -- bech32/bech32m, bắt buộc all-lower
    OR btc_address ~ '^[13][1-9A-HJ-NP-Za-km-z]{25,39}$'         -- Base58Check: KHÔNG có 0 O I l
  ) NOT VALID;                                                    -- NOT VALID: không phá dòng cũ
```

Lý do từng vế:
- Chặn bech32 viết hoa lẫn lộn (BIP-173 yêu cầu 1 case duy nhất).
- Chặn legacy chứa ký tự ngoài bảng chữ Base58 (`0`, `O`, `I`, `l`) — chính là dấu
  vết của 2 dòng đã hỏng (`178qtdaz…so1467…` chứa `1`/`o`/`0`).
- Không verify checksum trong DB (đúng yêu cầu), độ dài giới hạn 25–39 / 25–59.
- `NOT VALID` ⇒ chỉ áp cho INSERT/UPDATE mới; sau khi Phần D xoá 2 dòng hỏng có thể
  `VALIDATE CONSTRAINT` để phủ toàn bảng.

Kiểm tra trước khi áp: 2 dòng hỏng hiện tại **sẽ vi phạm** constraint này (đúng ý
đồ) ⇒ nên chạy **sau** bước D10.
