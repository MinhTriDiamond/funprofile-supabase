# BTC Attribution Resolver — Phase 2: hạ tầng shadow-log + danh sách 7 điểm chờ duyệt

**Từ:** Claude Code · **Cho:** CTO · **Ngày:** 24/08/2026
**Phạm vi:** Đúng yêu cầu Phase 2 — CHỈ hạ tầng log, KHÔNG đụng dữ liệu/quyết định thật, KHÔNG
gắn lệnh gọi vào bất kỳ điểm code RC4 nào (chờ duyệt danh sách ở Mục 2 trước).
**Tiền đề:** Phase 1 đã xong — xem `docs/audit/btc-attribution-resolver-phase1-20260823/HANDOFF.md`.

## 1. Hạ tầng shadow-log đã build (đã verify bằng Postgres 15 thật, không chỉ đọc định nghĩa)

Migration `20260824011216_b35c795f-289e-40cf-9044-3204a37dcb63.sql`:

- **`btc_resolver_shadow_log`** — bảng log duy nhất. `GRANT ALL ... TO service_role` là GRANT
  duy nhất, không có GRANT nào cho `anon`/`authenticated`; RLS bật, 1 policy
  `FOR ALL TO service_role` — không có policy khác ⇒ mọi role khác bị deny mặc định.
- **`log_btc_resolver_shadow_comparison(...)`** — điểm ghi DUY NHẤT. Tự gọi
  `resolve_btc_owner()` thật (không tự viết lại logic), tự `btc_normalize_address()` trước khi
  so khớp (mục 3 yêu cầu), `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` (mục 4 —
  idempotent), chỉ `service_role` được `EXECUTE`.
- **Trigger phân loại legacy-format** (`fn_btc_shadow_log_classify`) — set
  `suspected_legacy_format_mismatch = true` CHỈ KHI cả 3 đúng: không khớp thật, địa chỉ không
  phải bech32 (`!~* '^bc1'`), và `raw_address_legacy_side` (chuỗi RAW logic cũ dùng để tra map)
  khác `address` (đã normalize) — tách biệt khỏi "không khớp thật" đúng yêu cầu mục 3.
- **Trigger ưu tiên** (`fn_btc_shadow_log_priority_flag` + `fn_btc_shadow_log_priority_notify`)
  — đúng mục 6: nếu `legacy_user_id` HOẶC `resolver_user_id` trỏ tới username trong
  `app_settings.btc_shadow_priority_usernames` (mặc định: angelkim, angelutopia,
  angelthienhanh68, angelgiau, angelqueanh — admin sửa được không cần deploy lại), tự động
  set `priority_account_flag = true` VÀ tạo `notifications` (type mới
  `btc_shadow_priority_alert`) cho toàn bộ user có `role='admin'` — không đợi báo cáo 7 ngày.

**RAW evidence (Postgres 15 thật, apply đúng 2 file migration Phase 1 + Phase 2, không sửa):**
- Match (bech32): `is_match=t`.
- Mismatch bech32: `is_match=f`, `suspected_legacy_format_mismatch=f` (đúng — không gán nhầm).
- Mismatch địa chỉ legacy `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` với
  `raw_address_legacy_side='1a1zp1ep5qgefi2dmptftl5slmv7divfna'` (logic cũ đã lowercase, đúng
  bug Phase 1 phát hiện): `is_match=f`, `suspected_legacy_format_mismatch=t`.
- Idempotency: gọi lại đúng `idempotency_key` cũ → hàm trả về dòng toàn `NULL`
  (`ON CONFLICT DO NOTHING`), `count(*)` trong bảng vẫn = 1.
- Priority: log liên quan `angelkim` → `priority_account_flag=t`, và
  `notifications` có dòng mới `type='btc_shadow_priority_alert'` cho user có role admin.

**Fail-open (mục 2) — `supabase/functions/_shared/btcResolverShadowLog.ts`:**
2 hàm export, chọn theo khối lượng gọi tại từng điểm code (xem Mục 3.3 — đây là điểm đã sửa
sau câu hỏi 24/08 của CTO về timeout tích luỹ):
- `logBtcResolverShadowComparison()` — có `await`, `Promise.race` với timeout cứng
  **1.5s** (đã hạ từ 3s ban đầu). Chỉ dùng cho điểm gọi ít lần/1 invoke.
- `dispatchBtcResolverShadowLog()` — KHÔNG `await`, giao cho `EdgeRuntime.waitUntil()` (đúng
  pattern nền tảng đã dùng ở `create-post`/`fetch-wallet-history`/`live-replay-stream-ingest`)
  — luồng chính return ngay lập tức, hoàn toàn tách khỏi thời gian resolver, kể cả gọi hàng
  nghìn lần/invoke. Bắt buộc cho các điểm xử lý nhiều địa chỉ/tx trong 1 lần chạy.

Test thật bằng `deno test` (không mock ở tầng vitest vì đây là code Deno, chạy `npm:`
specifier) — `supabase/functions/_shared/btcResolverShadowLog.test.ts`, **7/7 pass**: RPC throw
đồng bộ, reject bất đồng bộ, trả `{error}`, case treo vô thời hạn thật cho bản `await` (xác
nhận quay lại đúng 1.5–2.0s, không throw), và **2 test mới cho bản `dispatch`** — gọi với
`.rpc()` treo vô thời hạn nhưng hàm return trong **< 50ms** (chứng minh hoàn toàn không
blocking bất kể resolver chậm cỡ nào), và xác nhận RPC vẫn thực sự được gọi đúng tham số ở nền.

Test guard tĩnh cho schema: `src/__tests__/btc-resolver-shadow-log-schema.test.ts` (8 test).
Toàn bộ suite hiện có (`npx vitest run`): 45 file, 341 pass / 21 skip, không regression.

**Chưa làm gì khác** — không sửa `app_settings` seed nào ngoài
`btc_shadow_priority_usernames`, không đụng `donations`/`profiles`/`profile_btc_aux_addresses`,
không gắn 1 dòng code nào vào 7 điểm RC4 dưới đây.

## 2. Danh sách ≥7 điểm code RC4 — CHỜ CTO DUYỆT TRƯỚC KHI SỬA

**Đã tự kiểm chứng lại danh sách RC4 gốc bằng grep/đọc code thật, KHÔNG chỉ copy lại danh sách
cũ trong bản giao việc đầu tiên** — vì phát hiện 4/9 tên trong danh sách gốc (`auto-scan-donations`,
`fast-scan-donations`, `moralis-webhook`, `scan-my-incoming`) thực chất là scanner **EVM/Moralis**,
không chứa logic map địa chỉ BTC→user nào (0 kết quả khi grep `btc_address`/`profile_btc_aux_addresses`
trong 4 file này). Loại khỏi danh sách. Ngược lại, tìm thêm được `btc-parser-v2` và
`btc-discovery-v2` — 1 hệ thống v2 riêng chưa từng được nhắc tới trong audit trước đó, cũng có
logic attribution thật, đọc/ghi `btc_ownership_snapshot`.

| # | Điểm code | Vị trí chính xác | Nguồn logic cũ | Trạng thái sống | Chế độ gọi shadow-log |
|---|---|---|---|---|---|
| 1 | `scan-btc-transactions` | `index.ts:341-342` — `btcToProfile.get(senderNorm)` / `.get(recipientNorm)` | map `btcToProfile` (chỉ đọc aux `verified=true`) | **Cron 5 phút** (`scan-btc-transactions-every-5min`) | `dispatch` — nhiều tx/vout mỗi lần cron chạy |
| 2 | `btc-wallet-audit` | `index.ts:174-185` — hàm `learn()`, `internalBtc.get/set` | map `internalBtc` (BFS học địa chỉ mới) | Gọi thủ công (admin/chính chủ/FATHER); nhánh ghi đã khoá ở Phase 1 (mục 1.1.1) | `dispatch` — BFS có thể quét hàng trăm tx/lần |
| 3 | `wallet-reconciliation-cron` | `index.ts:194-195` — `btcMap.get(toAddr)` / `.get(fromAddr)` | map `btcMap` (chỉ đọc aux `verified=true`) | **Không cron thật** dù tên có "cron" — gọi từ `src/components/admin/WalletReconciliationTab.tsx` (admin panel) | **`dispatch` bắt buộc** — xem Mục 3.3, đây là điểm khối lượng lớn nhất (~1.800 lần gọi tiềm năng/lần chạy) |
| 4 | `btc-history-repair` | `index.ts:89,103,187` — `addrToProfile.set/get` | map `addrToProfile` | Không tìm thấy caller (FE/cron) — chỉ manual invoke | `dispatch` — cùng dạng vòng lặp nhiều địa chỉ như #2/#3 |
| 5 | `btc-ownership-reverify` | `index.ts:372,415` — `summary.totals.accepted`, ghi `btc_ownership_snapshot` nguồn `hd_change_verified` | heuristic guard (tx_count/funded_btc) — **đã nêu ở Phase 1 mục 2**: đây chính là nguồn heuristic CTO doc Mục 3.1 yêu cầu cấm | Feature-flag `btc_ownership_reverify_enabled` mặc định OFF (không seed migration nào bật) — không tìm thấy caller khác | `dispatch` — G5A dry-run thật đã xử lý 1.744 candidate/lần (xem Mục 3.1) |
| 6 | `btc-parser-v2/resolver.ts` | `resolver.ts:12` (`loadOwnershipMap`), gọi từ `btc-parser-v2/index.ts:101` | đọc `profiles.btc_address` + `btc_ownership_snapshot` | **DORMANT trong production** — xem bằng chứng chi tiết Mục 3.1 (đã có 1 lần chạy thật có giám sát 03/07, không lặp lại từ đó) | `dispatch` — xử lý theo batch tx |
| 7 | `btc-discovery-v2` | `guards.ts:74-80` (`isAddressClaimed`) + `index.ts:79-155` (pipeline candidate→guard→accept/review) | đọc/ghi `btc_ownership_snapshot` | **DORMANT** — tương tự #6, xem Mục 3.1 | `dispatch` — pipeline candidate hàng loạt |

**Lưu ý quan trọng để CTO cân nhắc khi duyệt:**
- #5, #6, #7 đều đọc/ghi `btc_ownership_snapshot` — bảng heuristic đã nêu ở Phase 1 (Mục 2 HANDOFF
  Phase 1) là "chưa deprecate, chờ quyết định". Nếu CTO duyệt shadow-log cho 3 điểm này, kết quả
  shadow sẽ tự nhiên cho thấy heuristic (`hd_change_verified`) lệch với resolver chữ ký thật ở
  quy mô lớn — đúng mục đích nhưng cần chuẩn bị tinh thần là số dòng "không khớp" ở đây có thể áp
  đảo so với 4 điểm còn lại, vì bản chất 2 hệ thống resolve khác triết lý (heuristic vs chữ ký).
- #4, #6, #7 hiện không có đường gọi nào tới (dormant). Gắn shadow-log vào code path không chạy sẽ
  không sinh dữ liệu — có ý nghĩa "sẵn sàng khi bật lại" hơn là thu thập dữ liệu ngay. Đề xuất CTO
  xác nhận có cần ưu tiên 4 điểm ĐANG SỐNG (#1, #2, #3, #5-nếu-flag-bật) trước, hay vẫn muốn gắn cả 7.
- #2 (`btc-wallet-audit`) nhánh ghi production đã khoá — shadow-log gắn vào đây chỉ log lúc BFS
  chạy (đọc), không liên quan tới cờ `btc_wallet_audit_write_enabled`.

**Chưa sửa file nào trong 7 điểm trên.** Chờ CTO duyệt danh sách (hoặc chỉnh sửa phạm vi) trước
khi triển khai lệnh gọi `dispatchBtcResolverShadowLog()` vào từng điểm (cả 7 điểm đều xử lý
nhiều địa chỉ/tx mỗi lần invoke — xem Mục 3.3 — nên tất cả đều dùng bản `dispatch`, không có
điểm nào dùng bản `await` chặn luồng).

## 3. Trả lời 3 câu hỏi làm rõ trước khi duyệt danh sách (24/08/2026)

### 3.1 — `btc-parser-v2`/`btc-discovery-v2`: LIVE hay DORMANT?

**DORMANT trong production hiện tại — có bằng chứng cụ thể, không suy đoán.**

Tìm thấy tài liệu trước đây chưa từng nhắc trong audit này:
`docs/audit/btc-history-2026-07/subphase-g4/G4_DARK_LAUNCH_REPORT.md` +
`G4_VALIDATION_REPORT.md` (03/07/2026) — đúng như tên gọi, đây là 1 lần **"dark-launch"**: code
đã deploy nhưng có 3 lớp khoá để không chạy tự động:

1. **3 feature flag** `scan_btc_v2_enabled`, `btc_shadow_write_enabled`, `btc_discovery_v2_enabled`
   — migration `20260703063150` seed cả 3 = `false`, và đây là **migration DUY NHẤT** từng đụng
   3 key này (grep toàn bộ `supabase/migrations/*.sql`, không có migration nào khác bật lại).
2. **Không cron** — grep toàn bộ migration cho `cron.schedule` kết hợp tên 2 function này: 0 kết quả.
3. **Không FE/edge-function nào gọi tới** — grep `btc-parser-v2`/`btc-discovery-v2` toàn bộ
   `src/` + `supabase/functions/` (trừ chính 2 thư mục đó): 0 kết quả.

**Log gọi gần nhất tìm được (qua tài liệu, không phải DB log — không có quyền đọc log runtime):**
`G4_VALIDATION_REPORT.md` §5 — đúng 1 phiên chạy thật, có giám sát, 03/07/2026, bởi
`leminhtri.diamond@gmail.com` (khớp email trong context phiên này — đúng là CTO tự chạy):
1 lần `dry_run` + 1 lần `shadow_write` cho **4 tx cụ thể** (không phải toàn hệ thống), bật 2
flag qua REST ngay trước đó, tắt lại ngay sau đó — verify lại bằng query
`SELECT key, value FROM system_config WHERE key IN (...)` xác nhận cả 4 flag `= false` ở cuối
phiên (§2.5, có in kết quả). Dữ liệu để lại: 5 dòng `btc_tx_semantic`, 4 dòng
`btc_raw_tx_cache`, 2 dòng `audit_logs` (chưa xác nhận đã chạy `ROLLBACK.sql` hay chưa —
"Cha xác nhận thì bé chạy sau", không tìm thấy xác nhận tiếp theo trong repo).

`btc-discovery-v2` (G5A) còn ít sống hơn: `G5A_DRYRUN_REPORT.md` (cùng ngày 03/07) ghi rõ
**"⚠️ BLOCKED trước khi bật apply"** — dry-run 1.744 candidate bị mempool.space rate-limit
(1.039/1.630 lỗi), `btc_ownership_snapshot` = **0 dòng** sau dry-run, flag apply chưa từng bật,
và kết luận "Chờ Cha duyệt patch trước khi tiếp tục" — không tìm thấy phiên tiếp theo (không có
`G5A_DRYRUN_REPORT` v2, không có `G5B` nào trong repo).

**Giới hạn của câu trả lời này:** tôi không có service-role key hay quyền đọc `system_config`/
log runtime trực tiếp (đúng nguyên tắc sandbox Phase 1). Việc bật/tắt flag qua REST **không để
lại dấu vết trong git** — nên tôi **không thể chứng minh 100%** rằng không có ai bật lại flag
sau 03/07 mà không ghi tài liệu. Bằng chứng trên là tất cả những gì truy được từ mã nguồn + tài
liệu, và tất cả đều chỉ về hướng DORMANT kể từ 03/07. Đề nghị CTO tự chạy 2 query read-only sau
để có xác nhận 100% trước khi duyệt:
```sql
SELECT key, value FROM system_config
WHERE key IN ('scan_btc_v2_enabled','btc_shadow_write_enabled','btc_discovery_v2_enabled','btc_ownership_reverify_enabled');
SELECT count(*), max(created_at) FROM btc_tx_semantic;
SELECT count(*), max(verified_at) FROM btc_ownership_snapshot;
```

**⚠️ Đây CÓ PHẢI nguồn RC4 bị bỏ sót từ đầu audit không?** Đúng về mặt tồn tại code — `btc-parser-v2`/
`btc-discovery-v2` chưa từng được nhắc trong RC-code-trace gốc (`subphase-g1/rc_code_trace.md`)
hay bản giao việc Phase 1 ban đầu. **Nhưng KHÔNG làm thay đổi phạm vi ảnh hưởng dữ liệu đã audit**,
vì (xem 3.2) — v2 ghi vào bảng hoàn toàn khác `donations`/`transactions`/`wallet_transfers` (những
bảng đã audit), và phiên chạy thật duy nhất (03/07) đã tự verify các bảng đó "không đổi". Nên đây
là 1 lỗ hổng về **độ đầy đủ của danh sách kiểm kê code**, không phải 1 nguồn sai lệch dữ liệu mới
cần audit lại từ đầu.

### 3.2 — So với v1 (`scan-btc-transactions`): song song, xung đột, hay đã thay thế?

**Song song về mặt tồn tại code, nhưng KHÔNG xung đột được về mặt kiến trúc — ghi vào 2 tập bảng
hoàn toàn tách biệt, đã tự đọc code + có bằng chứng test thật xác nhận, không suy đoán theo tên.**

| | v1 (`scan-btc-transactions`, sống, cron 5 phút) | v2 (`btc-parser-v2`, dormant) |
|---|---|---|
| Ghi vào | `donations`, `wallet_transfers` → sync sang `transactions` qua trigger | `btc_tx_semantic`, `btc_raw_tx_cache`, `btc_review_queue` |
| Đọc ownership từ | `profiles.btc_address` + `profile_btc_aux_addresses` (`verified=true`) | `profiles.btc_address` + `btc_ownership_snapshot` |
| UI/leaderboard đọc từ | `donations`/`transactions` (đã xác nhận trong toàn bộ audit trước đó) | Không có UI nào đọc `btc_tx_semantic` (chưa build) |

Bằng chứng KHÔNG suy đoán:
- `G4_DARK_LAUNCH_REPORT.md` checklist mục 15: **"Không code cron, không sửa scanner v1, không
  đụng UI/leaderboard"** — đã tick khi build G4, tức chủ đích thiết kế không đụng v1.
- `G4_VALIDATION_REPORT.md` §4 — sau khi CHẠY THẬT shadow-write (không phải chỉ đọc code): tự
  verify bằng query và ghi rõ **"`donations` / `wallet_transfers` / `transactions`: không đổi"**.
  Đây là bằng chứng thực nghiệm, không phải suy luận từ kiến trúc.

**Kết luận: v1 hiện là nguồn duy nhất production thật sự dùng (leaderboard, lịch sử donation,
mọi thứ user thấy). v2 CHƯA thay thế v1 — theo đúng lộ trình ghi trong G4 report §14: "G6 sau
khi shadow diff = 0" mới là lúc cutover, và G5/G6 chưa từng mở (`G5A` bị BLOCKED, không có G5B/G6
nào trong repo). Không có xung đột ghi đè vì 2 hệ thống không đụng chung 1 bảng nào.**

### 3.3 — Timeout fail-open: giá trị cụ thể + đủ an toàn cho điểm gọi số lượng lớn không?

**Giá trị đang set (đã sửa trong phiên này): `SHADOW_LOG_TIMEOUT_MS = 1500` (1.5 giây)** —
`supabase/functions/_shared/btcResolverShadowLog.ts:31` (trước khi sửa là 3000ms/3 giây, xem
Mục 1). Nhưng **câu hỏi thật sự quan trọng hơn con số** — xem phân tích dưới.

**Ước tính khối lượng gọi thật cho `wallet-reconciliation-cron` (điểm nặng nhất trong 7 điểm),
đọc trực tiếp từ code, không phải phỏng đoán:**
- `MAX_WALLETS_PER_CHAIN = 15` (`index.ts:17`) — tối đa 15 địa chỉ BTC/lần chạy.
- Mỗi địa chỉ: `fetchJson(mempool.space/address/{addr}/txs)` — API này trả **tối đa 25-50 tx
  gần nhất** theo trang mặc định (không phân trang trong code này).
- Mỗi tx: vòng lặp toàn bộ `vout` (`index.ts:190`), điểm gọi resolver nằm NGAY TRONG vòng lặp
  vout này (`btcMap.get(toAddr)`/`btcMap.get(fromAddr)`, dòng 194-195).
- **Worst-case ước tính:** 15 địa chỉ × 50 tx × ~2.5 vout/tx ≈ **1.875 lần gọi shadow-log tiềm
  năng trong 1 lần cron chạy**, nếu gắn thẳng vào vòng lặp vout không điều kiện.

**Nếu dùng bản `await` (chặn luồng) với timeout cũ 3s, resolver chậm/treo hàng loạt (vd DB quá
tải, network issue):** 1.875 × 3s ≈ **5.625 giây ≈ 93 phút** worst-case tuần tự — đủ giết chết
cả lần chạy cron dù MỖI lần gọi tự nó fail-open không throw lỗi. Với timeout mới 1.5s vẫn còn
**~47 phút** worst-case — **vẫn không đủ an toàn chỉ bằng cách rút ngắn số giây.**

**Kết luận: rút ngắn timeout KHÔNG PHẢI giải pháp đúng cho điểm khối lượng lớn — cần đổi hẳn
sang cơ chế không-blocking.** Đã sửa: thêm hàm `dispatchBtcResolverShadowLog()` (không `await`,
giao cho `EdgeRuntime.waitUntil()` — đúng pattern nền tảng đã dùng ở `create-post`,
`fetch-wallet-history`, `live-replay-stream-ingest`). Đã test thật (`deno test`): gọi với
`.rpc()` treo **vô thời hạn**, hàm `dispatch` vẫn return trong **< 50ms** — hoàn toàn tách thời
gian luồng chính khỏi thời gian resolver, bất kể gọi bao nhiêu lần. Đã cập nhật bảng 7 điểm ở
Mục 2 — **cả 7 điểm đều dùng `dispatch`**, không điểm nào dùng bản `await` (vì cả 7 đều xử lý
nhiều địa chỉ/tx mỗi lần invoke, không có điểm nào thực sự "gọi 1 lần/request" để an toàn với
`await`).

Timeout 1.5s trên bản `await` vẫn giữ lại làm phòng hờ cho use-case tương lai thật sự đơn lẻ
(vd nếu sau này có 1 endpoint admin "recheck 1 địa chỉ" gọi trực tiếp), không áp dụng cho 7
điểm trong danh sách này.

## 4. Cam kết cho giai đoạn sau khi CTO duyệt (chưa thực hiện được vì chưa có dữ liệu)

- **Mục 6 (báo ngay tài khoản ưu tiên):** hạ tầng đã sẵn sàng (trigger tự động, không phụ thuộc
  điểm code nào gọi tới trước) — nhưng vì chưa gắn vào 7 điểm RC4, **hiện chưa có dòng log nào
  được tạo ra**, nên chưa có gì để báo. Sau khi CTO duyệt + tôi gắn lệnh gọi, bất kỳ dòng nào
  chạm 5 tài khoản trên sẽ tự động tạo `notifications` cho admin ngay lập tức (không cần tôi
  chủ động kiểm tra) — tôi sẽ chủ động báo lại trong phiên tiếp theo nếu phát hiện.
- **Mục 7 (báo cáo sau ≥7 ngày):** cùng lý do — đồng hồ 7 ngày chỉ nên bắt đầu tính từ lúc lệnh
  gọi thật được gắn vào ít nhất 1 điểm code đang sống, không phải từ hôm nay.
