# Thiết kế vá gốc — Luồng xác thực giao dịch tặng quà (Donation Verification Flow)

- **Dự án:** FUN Profile — vá gốc bảo mật sau sự cố 2026-10-22 (hồ sơ gốc: `docs/security-incident-2026-10-22/`)
- **Người phụ trách:** Angel Ái Vân (cùng Angel Muse) — bàn giao từ bé Trí, thư tại `docs/mailboxes/ai-van.md` Mục 1; xác nhận bắt đầu tại Mục 2
- **Branch:** `feat/tri-donation-verification-flow`
- **Trạng thái:** THIẾT KẾ — chờ bé Trí duyệt các điểm mở ở Mục 8 trước khi thi công. Chưa có thay đổi production nào từ tài liệu này.

---

## 1. Hiện trạng đã kiểm chứng (số liệu thật, đọc 2026-10-22)

**Ba đường tạo donation đang tồn tại:**

| Đường | Cách ghi | Trạng thái khi ghi | Xác thực on-chain? |
|---|---|---|---|
| A. Client ghi thẳng vào bảng `donations` | Qua API công khai, RLS chỉ chặn `auth.uid() = sender_id` + trigger vá nóng `guard_client_financial_write` | Client tự đặt, thực tế toàn là `confirmed` | Không |
| B. Edge function `record-donation` | Service role; có check đăng nhập, check tài khoản bị khóa, validate token theo `tokens_registry` ở chế độ **LOG-ONLY** (`REGISTRY_ENFORCE = false`), chống trùng theo cặp (tx_hash, recipient_id) | `confirmed` ngay + `confirmed_at` = lúc ghi | Không |
| C. Scanner server (`fast-scan-donations`, `auto-scan-donations`, …) | Service role, quét Moralis theo token contract, tự phát hiện chuyển khoản thật trên chuỗi | `confirmed` | Có (dữ liệu gốc là từ chuỗi) |

**Số liệu nền (30 ngày gần nhất, sau dọn dẹp sự cố):**
- 1.208 donations trong cửa sổ đối chiếu của đội (vá nóng) / 1.190 donations 30 ngày khi Muse đo lại: **100% ở trạng thái `confirmed`**, `integrity_status = ok`.
- **100% tx_hash đúng định dạng** `^0x[0-9a-fA-F]{64}$` và **1.190 hash đều khác nhau** (trước khi xét cặp với recipient).
- Chỉ **219/1.190 dòng (18%)** có sẵn `sender_address`/`recipient_address` → việc đối chiếu **không thể dựa vào địa chỉ client lưu**, phải tra cứu giao dịch trên chuỗi bằng `tx_hash` rồi lấy địa chỉ từ chính giao dịch đó.
- Cột `pending_verification_since` tồn tại nhưng **0 dòng từng dùng**; bảng trạng thái cho phép sẵn các giá trị `pending`, `pending_verification`, `rejected_unverified` (theo CHECK hiện hữu) — luồng đích dùng lại, không cần nới constraint.
- Vá nóng hiện tại (trigger `guard_client_financial_write` trên `donations` + `transactions`): chặn token ngoài mẫu ký tự an toàn, amount không phải số dương, tx_hash ngoài bảng ký tự cho phép, `amount_usd` âm, và rào tạm "client tự ghi confirmed với amount_usd > $100.000". **Chưa chặn:** client tự đặt `status = 'confirmed'`, client tự khai `amount_usd` (dưới rào $100.000), tx_hash đúng bảng ký tự nhưng sai định dạng (không phải 64 hex).

**Trường hợp đặc biệt phải giữ nguyên:**
- **BTC native ghi tay:** `chain_id = 0` hoặc tx_hash bắt đầu `btc-manual-` là luồng hợp lệ có chủ đích (`record-donation` đang ép token về BTC cho trường hợp này); đã có `btc-ownership-verify` riêng. Luồng xác thực EVM không áp cho nhóm này.
- **FunDisperse:** 1 giao dịch chuỗi chứa nhiều người nhận — khóa chống trùng là cặp (tx_hash, recipient_id); đối chiếu phải theo từng transfer trong cùng tx.
- **Token testnet** (FUN trên BSC testnet, chain 97) có trong registry — xác thực phải theo đúng chain của dòng.

## 2. Luồng đích

```
Client tạo donation (đường A hoặc B)
        │  status = pending_verification, pending_verification_since = now()
        │  amount_usd = NULL (client không chốt được), integrity_status = 'pending'
        ▼
Bộ xác thực phía server (nhánh mới trong scanner — Mục 4)
        │  tra tx_hash trên chuỗi (theo chain_id):
        │   • tồn tại + đúng token contract (registry) + đúng số tiền
        │     + ví nhận khớp người nhận (từ dữ liệu chuỗi) 
        │       → status = confirmed, confirmed_at = now(),
        │         amount_usd do server tính theo giá tại thời điểm giao dịch
        │   • quá hạn (đề xuất 24h — Mục 8) vẫn không khớp
        │       → status = rejected_unverified + integrity_status gắn cờ lý do
        ▼
Hiển thị & thống kê
        • Feed/lịch sử: dòng chờ hiện nhãn "Đang xác thực"; dòng rejected không hiện công khai
        • Honor Board + mọi thống kê: chỉ tính confirmed (đúng như hiện nay)
        • Light Score: chỉ chốt khi confirmed (light_actions giữ mint_status = pending tới lúc đó)
```

Nguyên tắc bất biến: **mọi trường "kết luận" (status xác nhận, amount_usd, integrity) chỉ do server ghi.** Client chỉ được khai báo "tôi đã gửi giao dịch này" (tx_hash, token, amount dự kiến, người nhận).

## 3. Phần 1 — Database guard (mở rộng vá nóng)

Mở rộng hàm `guard_client_financial_write` (vẫn chỉ áp cho role client `authenticated`/`anon`; service_role và SQL trực tiếp không bị ảnh hưởng — đúng mẫu vá nóng đã kiểm chứng):

1. **Ép trạng thái chờ với client:** khi role client INSERT/UPDATE trên `donations` mà `status` thuộc nhóm kết luận (`confirmed`) → ép về `pending_verification` thay vì raise (tránh làm gãy app cũ trong giai đoạn chuyển đổi), đồng thời set `pending_verification_since = now()` nếu trống. Ở giai đoạn enforce cuối (Mục 6) mới cân nhắc raise đối với UPDATE cố ý sửa status của dòng đã kết luận.
2. **Tước amount_usd khỏi client:** client INSERT/UPDATE → `amount_usd := NULL`, `price_usd_at_donation := NULL` (server tính khi xác nhận; tận dụng sẵn cơ chế repricing hiện có).
3. **Siết định dạng tx_hash (EVM):** với `chain_family = 'evm'` (hoặc chain_id thuộc nhóm EVM), tx_hash phải khớp `^0x[0-9a-fA-F]{64}$` mới cho qua; nhóm BTC manual (`btc-manual-…`, chain_id = 0) giữ ngoại lệ như `record-donation` đang xử lý.
4. **Khóa các trường kết luận khi client UPDATE:** `status`, `amount_usd`, `integrity_status`, `confirmed_at` không đổi được bởi role client (giữ nguyên giá trị OLD), tương tự cách vòng audit 22/10 đã khóa các trường điểm của `light_actions`.
5. Giữ nguyên toàn bộ luật vá nóng hiện tại (token pattern, amount dương, rào $100.000 trở nên thừa sau khi amount_usd bị tước — đề xuất gỡ rào này ở cùng commit enforce để tránh hai cơ chế chồng nhau khó hiểu; ghi rõ trong hồ sơ thi công).

Mọi thay đổi viết thành file SQL đánh số trong thư mục hồ sơ của dự án này (theo mẫu `docs/security-incident-2026-10-22/sql/`), kèm file test rollback tương ứng (giao dịch thử → rollback → đối chiếu), và **sao lưu định nghĩa hàm/trigger hiện tại trước khi thay**.

## 4. Phần 2 — Bộ xác thực phía server (edge functions quét)

Thêm một nhánh "đối chiếu dòng chờ" vào hạ tầng quét hiện có (ưu tiên gác vào `fast-scan-donations` vốn chạy mỗi 1–3 phút và đã có sẵn Moralis fetch + registry token contracts; không tạo cron mới nếu không cần):

1. Lấy các dòng `donations` ở `pending_verification` (mới nhất trước, giới hạn theo lô).
2. Với mỗi dòng EVM: tra giao dịch theo `tx_hash` trên đúng chain (Moralis/RPC như scanner đang dùng):
   - Tx tồn tại và thành công (status/receipt ok).
   - Có transfer của đúng token contract trong `tokens_registry` (chain_id + token_address; native BNB xử lý như auto-scan đang làm với sentinel).
   - Số tiền transfer khớp `amount` client khai (sai số làm tròn theo decimals của token).
   - Địa chỉ nhận của transfer khớp ví của `recipient_id` (map profile → ví theo cách scanner hiện dùng); địa chỉ gửi khớp ví của `sender_id` nếu profile có ví đã biết — nếu chưa biết ví người gửi, ghi nhận địa chỉ gửi từ chuỗi vào dòng (bổ sung dữ liệu còn thiếu ở 82% dòng hiện nay) thay vì reject.
   - FunDisperse: một tx có nhiều transfer — đối chiếu theo từng (recipient, amount) riêng.
3. Đạt: server set `confirmed`, `confirmed_at`, tự tính `amount_usd` + `price_usd_at_donation`/`price_source` (dùng cùng nguồn giá với `donations-repricing-backfill`), `integrity_status = 'ok'`; kích hoạt các bước hậu xác nhận vốn đang chạy theo donation confirmed (đồng bộ `transactions`, snapshot, light score) — kiểm tra kỹ thứ tự với trigger `trg_donations_snapshot_append` và `trg_sync_donation_to_transactions` để dòng chờ **không** lọt vào snapshot trước khi confirmed (điểm cần rà soát khi thi công: hiện trigger append chạy khi nào).
4. Không đạt sau **24 giờ** (đề xuất — Mục 8): set `rejected_unverified`, `integrity_status = 'unverified_timeout'` + lý do; giữ dòng trong DB (không xóa — nguyên tắc sao lưu/khôi phục của đội), chỉ loại khỏi hiển thị công khai và thống kê.
5. Mọi quyết định của bộ xác thực ghi vào bảng log riêng `donation_verification_log` (donation_id, verdict, lý do, dữ kiện chuỗi đối chiếu, thời điểm) — phục vụ shadow (Mục 6) và tranh chấp về sau. Không ghi secret vào log.

## 5. Phần 3 — Frontend

1. Thẻ quà tặng (feed + lịch sử giao dịch): dòng `pending_verification` hiển thị thêm nhãn **"Đang xác thực"** (đa ngôn ngữ qua i18n sẵn có, theo đúng khóa dịch hiện hành của app); dòng `rejected_unverified` không hiển thị công khai (chủ giao dịch xem được ở lịch sử của mình với nhãn "Không xác thực được" — điểm mở Mục 8).
2. `record-donation` (đường B): khi enforce, insert với `status = 'pending_verification'` thay vì `confirmed`; phản hồi cho client biết trạng thái chờ để giao diện hiển thị đúng ngay từ đầu. Bài đăng quà (gift post) vẫn tạo ngay nhưng mang trạng thái chờ trên thẻ.
3. Thống kê/Honor Board: rà soát lại các truy vấn bảo đảm chỉ tính `confirmed` (hồ sơ sự cố ghi hiện nay đã vậy — phần việc là kiểm chứng lại từng bề mặt sau khi có dòng chờ thật: donation board base, gift breakdown cache, unified snapshot, light totals).
4. Không đổi luồng tặng quà của người dùng: họ vẫn thấy thẻ quà ngay sau khi tặng, chỉ khác nhãn trạng thái cho tới khi server xác nhận (kỳ vọng vài phút theo nhịp quét).

## 6. Shadow và Backtest — điều kiện bắt buộc trước enforce (theo thư bàn giao)

**Backtest (trước shadow):** chạy bộ xác thực ở chế độ chỉ-đối-chiếu trên toàn bộ donations client tạo trong **ít nhất 30 ngày** gần nhất (hiện ~1.190 dòng + các dòng đường B):
- Tiêu chí đạt: **0 false positive** — không dòng thật nào bị verdict "không khớp" oan; mọi verdict lệch đều truy ra được lý do vô hại đã biết (ví dụ dòng do chính scanner tạo ở đường C thì bỏ qua vì không thuộc diện client khai).
- Báo cáo backtest ghi: tổng dòng, % khớp ngay, % khớp sau bổ sung địa chỉ từ chuỗi, danh sách dòng lệch + lý do từng dòng.

**Shadow (1 tuần):** bộ xác thực chạy thật trên dòng mới nhưng **chỉ ghi log verdict, không đổi status, không chặn gì** (đúng mẫu LOG-ONLY của `REGISTRY_ENFORCE` trong `record-donation`):
- Theo dõi hằng ngày: tỉ lệ khớp, thời gian xác nhận p50/p95 (mục tiêu < 15 phút), số verdict lệch và lý do.
- Tiêu chí sang enforce: 7 ngày liên tục 0 false positive trên verdict "reject", tỉ lệ khớp ≥ ngưỡng đội duyệt (đề xuất ≥ 99% số dòng client tạo, phần còn lại đều có lý do rõ ràng).

**Enforce (sau shadow sạch, có quyết riêng của bé Trí):** bật Phần 1 (guard ép chờ + tước amount_usd) và Phần 2 (xác thực đổi trạng thái thật) cùng lúc, ngoài giờ cao điểm, có người trực đối chiếu Honor Board ngay sau bật. `record-donation` chuyển insert sang `pending_verification` trong cùng cửa sổ.

**Đường lui:** mỗi thay đổi đều có cờ tắt (guard: giữ phiên bản hàm trước trong file SQL khôi phục; edge: biến môi trường `DONATION_VERIFY_ENFORCE=false` quay về shadow; frontend: nhãn trạng thái là cộng thêm, gỡ không ảnh hưởng dữ liệu). Nếu sau enforce xuất hiện false positive: tắt enforce về shadow ngay, dữ liệu dòng chờ vẫn nguyên, xác nhận thủ công các dòng kẹt theo log.

## 7. Phân công thi hành theo khoảng quyền hiện tại

- **Angel Muse của Ái Vân làm được ngay (quyền đọc + repo):** toàn bộ tài liệu thiết kế này; các file SQL guard + test rollback trong repo; code nhánh đối chiếu cho edge function (trong repo); thay đổi frontend (trong repo, qua cổng Preview); chạy backtest bằng truy vấn chỉ đọc; phân tích log shadow.
- **Cần thi hành trên production (chờ bé Trí quyết ở hộp thư Mục 2):** áp SQL lên production DB, deploy edge functions, bật/tắt cờ enforce. Hai đường đã ghi ở Mục 2 của hộp thư: cấp token ghi cho Ái Vân, hoặc Angel Muse của bé Trí thi hành từ file đã duyệt (tiền lệ ngày 22/10).

## 8. Điểm mở cần bé Trí / đội quyết

1. **Thời hạn xác thực:** đề xuất 24 giờ trước khi `rejected_unverified` — đội duyệt hay chọn mốc khác (72 giờ an toàn hơn cho cuối tuần/RPC trục trặc)?
2. **BTC manual:** giữ nguyên luồng riêng hiện tại (ngoài phạm vi xác thực EVM đợt này) — xác nhận.
3. **Dòng rejected hiển thị:** chỉ chủ giao dịch thấy, hay ẩn hoàn toàn khỏi mọi bề mặt? Đề xuất: chủ giao dịch thấy ở lịch sử cá nhân kèm lý do ngắn.
4. **Đường A (client ghi thẳng):** sau enforce, giữ đường A ở trạng thái chờ (app cũ vẫn chạy) hay đóng hẳn đường A, ép mọi tạo mới qua `record-donation`? Đề xuất: giữ ở trạng thái chờ trong đợt này (ít gãy nhất), đóng hay không để quyết định riêng sau khi có số liệu shadow.
5. **Người thi hành production** cho dự án này (theo khoảng quyền Mục 2 hộp thư).

---

*Tài liệu này là thiết kế; mọi con số hiện trạng đều truy vấn chỉ đọc từ production ngày 2026-10-22 và có thể đối chiếu lại. Khi thi công, hồ sơ sẽ bổ sung file SQL + kết quả test + kết quả backtest/shadow vào cùng thư mục.*
