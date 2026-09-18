# Sub-phase D — BTC Aux Address & Wrong Donation Audit

**Ngày:** 2026-07-03
**Trạng thái:** ✅ Đã FREEZE, đã audit toàn bộ 711 aux `hd_input_back`. Chưa sửa data.
**Ưu tiên:** P0 — dữ liệu counterparty BTC bị ô nhiễm do gán nhầm ví exchange/hot wallet cho user nội bộ.
**Người thực hiện:** Bé Angel — theo ủy quyền của Cha (approve Sub-phase D + freeze ngay).

---

## 0. TÓM TẮT CHO CHA

| Chỉ số | Giá trị |
|---|---|
| Tổng aux `hd_input_back` trong DB | **711** |
| Class **A** — chắc chắn là exchange/hot wallet | **77** (10.8%) |
| Class **B** — nghi ngờ cao (đạt ngưỡng audit) | **74** (10.4%) |
| Class **C** — cần review theo policy mới | **113** (15.9%) |
| Class **D** — nhiều khả năng hợp lệ | **447** (62.9%) |
| **User bị ảnh hưởng bởi A/B** | **6** — angelhoangtydo, angelthuha, angelkim, trogiauco, father, angelanhnguyet |
| Aux có tx_count cao nhất | **2,262,813** tx (đây gần như chắc chắn là Binance hot wallet, gán cho @angelkim) |
| Aux có funded_sum cao nhất | **59,354,142 BTC** — con số phi lý → hot wallet lớn |
| Donations BTC do user A/B gửi sau khi có aux xấu (đã dedup) | **1.782 dòng**, ~**5.04 BTC** trên sổ (cần soi lại tx-by-tx) |

**Kết luận sớm:** Vấn đề aux mislearning **tập trung ở 6 user**, không phải rải rác 711. Các user còn lại có aux ở D_valid. Vụ angelutopia (Sub-phase C) KHÔNG do aux — do semantic batch-send (RC-2), sẽ xử lý trong Sub-phase E.

**Đã FREEZE code:** `supabase/functions/btc-wallet-audit/index.ts` line 161-179: `learn(..., 'hd_input_back', ...)` bây giờ short-circuit trả `false` trừ khi env `BTC_HD_INPUT_BACK_ENABLED=1`. Scanner cron `scan-btc-transactions` đã tắt heuristic này từ trước (chỉ ghi comment lịch sử).

---

## 1. FREEZE STATUS

| Nguồn sinh `hd_input_back` | Trạng thái | Ghi chú |
|---|---|---|
| `supabase/functions/btc-wallet-audit/index.ts` | 🟢 **FROZEN** — short-circuit trong `learn()` | Chỉ chạy manual (admin), không cron. Bật lại bằng env `BTC_HD_INPUT_BACK_ENABLED=1` khi Sub-phase E hoàn tất. |
| `supabase/functions/scan-btc-transactions/index.ts` | 🟢 Đã tắt từ trước | Comment line 204/328 xác nhận heuristic bị deprecate; không còn code path ghi. |
| Cron `scan-btc-transactions-every-5min` | 🟢 An toàn | Chỉ chạy scanner — scanner không sinh aux `hd_input_back`. |
| Cron khác trong `cron.job` | 🟢 Không có job nào invoke `btc-wallet-audit` | Đã grep toàn bộ `cron.job.command`. |

Không có edge/cron nào khác đang sinh `hd_input_back`. Nguồn duy nhất còn lại là admin gọi tay `btc-wallet-audit` → đã bị chặn.

---

## 2. PHƯƠNG PHÁP AUDIT

1. Dump 711 aux `source='hd_input_back'` + join `profiles` để lấy username/display_name.
2. Với mỗi aux, tính:
   - **narrow_don_count/btc**: donations có `tx_hash = first_seen_tx AND sender_id = aux.user_id AND chain_id=0` (chứng cứ trực tiếp).
   - **broad_don_count/btc**: donations của user đó gửi trên BTC kể từ khi aux được học (proxy tối đa).
3. Fetch mempool.space `/api/address/{addr}` cho cả 711 địa chỉ (concurrency 4, 0 lỗi) → `tx_count`, `funded_txo_sum`, `spent_txo_sum`.
4. Phân loại theo ngưỡng Cha duyệt:
   - **A_exchange_certain**: `tx_count > 500` OR `funded_btc > 50`.
   - **B_suspect_high**: `tx_count > 100` OR `funded_btc > 10` (ngưỡng audit của Cha) & không đạt A.
   - **C_review_new_policy**: `tx_count > 20` OR `funded_btc > 1` (policy mới) & không đạt A/B.
   - **D_likely_valid**: còn lại.

Ngưỡng A là bé chủ động chia nhỏ B để tách các case chắc chắn ra khỏi các case còn cần review — Cha có thể ép về chung 1 class nếu muốn.

---

## 3. KẾT QUẢ PHÂN LOẠI

### 3.1. Tổng quan
```
D_likely_valid       : 447 (62.9%)
C_review_new_policy  : 113 (15.9%)
A_exchange_certain   :  77 (10.8%)
B_suspect_high       :  74 (10.4%)
```

### 3.2. Top 15 địa chỉ nghi ngờ nhất (A_exchange_certain)

| Address | User | tx_count | funded_btc |
|---|---|---:|---:|
| `bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h` | @angelkim | 2,262,813 | 59,354,142 |
| `bc1qr35hws365juz5rtlsjtvmulu97957kqvr3zpw3` | @angelthuha | 908,475 | 2,679,770 |
| `bc1qsatlphjcgvzlt9xhsgn0dnjus5jgwg83dr05c6` | @trogiauco | 656,424 | 2,384,856 |
| `35C2L1pCgwzBHNcDcVL1a5RuoefeWqyjAR` | @angelhoangtydo | 499,728 | 23,282 |
| `1C6XJtNXiuXvk4oUAVMkKF57CRpaTrN5Ra` | @trogiauco | 446,416 | 89,312 |
| `1GrwDkr33gT6LuumniYjKEGjTLhsL5kmqC` | @angelthuha | 444,991 | 12,074,367 |
| `bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v` | @trogiauco | 393,247 | 1,015,089 |
| `bc1qq2mvrp4g3ugd424dw4xv53rgsf8szkrv853jrc` | @angelthuha | 302,580 | 11,364 |
| `bc1qujepl0k5n0ga2e86yskvxa6auehpf6dlf84dx0` | @angelthuha | 224,508 | 87,859 |
| `bc1qpsys7sfk5u7ue3lffwzszzvffhtku78kr0vva4` | @angelthuha | 169,656 | 15,356 |
| `bc1qqz623jyqdsh2w5y5kdmzk2ws6mzr2mt2etv5gx` | @trogiauco | 127,040 | 207,831 |
| `bc1q4vxcxw7mpg9dcryqu0kav8awrn7qk5e6wgs3hg` | @angelhoangtydo | 105,133 | 5,432,172 |
| `3CAQAw7m95axbY761Xq8d9DADhjNaX9b8o` | @angelthuha | 97,873 | 8,170 |
| `bc1qcza6s6ew2kaxe9hdyrqqeuadc3za7fva5yjcnf` | @trogiauco | 94,969 | 73,198 |
| `bc1qwelntg7tpxwgmh7gea0kycclx87mksnvhaadgf` | @angelhoangtydo | 84,805 | 4,241,132 |

Không có ví cá nhân bình thường nào chạm mức triệu tx hay triệu BTC funded — đây 100% là exchange/hot wallet.

### 3.3. Phân bố A/B theo user

| User | aux_total | A | B | C | D | broad_don_count | broad_don_btc | max_tx_count | max_funded_btc |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| @angelhoangtydo | 349 | 33 | 43 | 71 | 202 | 1,745 | 0.20940 | 499,728 | 5,432,172 |
| @angelthuha | 185 | 26 | 23 | 27 | 109 | 0 | 0 | 908,475 | 12,074,367 |
| @angelkim | 31 | 10 | 3 | 3 | 15 | 31 | 4.67836 | 2,262,813 | 59,354,142 |
| @trogiauco | 48 | 8 | 2 | 8 | 30 | 0 | 0 | 656,424 | 2,384,856 |
| @father | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 2 | 19.50 |
| @angelanhnguyet | 6 | 0 | 1 | 1 | 4 | 0 | 0 | 63 | 17.89 |

Ghi chú:
- `@angelhoangtydo` là **tâm chấn**: 349 aux, 21.8% là A/B. Discovery BFS đã "lao vào" một cụm exchange rồi lan tiếp.
- `@angelthuha`, `@trogiauco`, `@angelkim`: cùng pattern — BFS chạm hot wallet lớn, học tràn.
- `@father` chỉ có 2 aux B (`funded_btc > 10`, `tx=2`) — pattern khác, không phải exchange, có thể là cluster nội bộ. Cần Cha xác nhận.
- `@angelanhnguyet` chỉ có 1 aux B nhẹ (`funded=17.89`, `tx=63`) — nên đưa vào review, không xóa vội.

### 3.4. Top affected donations & tx_hash
- `evidence/top_affected_donations.csv` — top 100 donations lớn nhất do 5 user A/B gửi (angelhoangtydo/angelthuha/angelkim/trogiauco/angelanhnguyet). Đứng đầu: `angelkim → angelgiau 1.018 BTC` (tx `2f38060e...`) và `angelkim → angelthutrang 0.150 BTC` (tx `05a78ade...`) — trùng khớp với 2 case Sub-phase C xác nhận là do Binance hot wallet.
- `evidence/top_affected_txhashes.csv` — top 50 tx_hash bị ô nhiễm.

---

## 4. USERS NGOÀI 3 CASE BAN ĐẦU BỊ ẢNH HƯỞNG

Ngoài `@angelkim`, `@angelutopia`, `@angelthienhanh68` (Cha đã biết):

| User | Loại impact | Ghi chú |
|---|---|---|
| **@angelhoangtydo** | 🔴 Nghiêm trọng nhất | 33 aux exchange + 43 suspect, 1,745 donations BTC gắn với ID này sau khi aux xấu được học |
| **@angelthuha** | 🔴 Cao (chưa gửi donation nội bộ) | 26 aux exchange, max funded 12M BTC — history/benefactors đã bị bơm số cực lớn nếu view sum theo aux |
| **@angelkim** | 🔴 Đã xác nhận Sub-phase C | Binance hot wallet 59M BTC |
| **@trogiauco** | 🟠 Cao (chưa gửi donation) | 8 aux exchange, max funded 2.38M BTC |
| **@father** | 🟡 Cần Cha xác nhận | Chỉ 2 aux B, funded_btc=19.5, tx=2 — có thể là cluster hợp lệ, không phải exchange |
| **@angelanhnguyet** | 🟡 Cần review | 1 aux B nhẹ |

`@angelutopia` (Sub-phase C) và `@angelthienhanh68`: **KHÔNG** có aux A/B nào — vấn đề của họ là semantic mapping (RC-2, batch-send), sẽ xử lý ở Sub-phase E.

---

## 5. ĐÁNH GIÁ THIỆT HẠI (chưa sửa)

### 5.1. Trên `donations`
- Đã dedup theo `donation.id`:
  - 6 user impacted × donations BTC gửi kể từ first_bad_aux = **1,782 dòng ~ 5.04 BTC trên sổ**.
  - Nhưng phần lớn là các donation cực nhỏ (0.0001 BTC) của @angelhoangtydo (1,745 dòng, 0.209 BTC). Chưa rõ trong 1,745 dòng đó bao nhiêu là do aux xấu gán sai counterparty, bao nhiêu là ví thật.
  - **BTC bị nghi vấn cao nhất** (từ file `top_affected_donations.csv`):
    - `angelkim → angelgiau`: **1.018 BTC** (tx `2f38060e…`) — Sub-phase C xác nhận từ Binance hot wallet, KHÔNG phải Kim.
    - `angelkim → angelthutrang`: **0.150 BTC** (tx `05a78ade…`) — Sub-phase C xác nhận tương tự.
    - `angelanhnguyet → angeldieungoc`: **0.05 BTC** — cần verify.

### 5.2. Trên leaderboard / benefactors
- Nếu `Benefactors` cộng contribution BTC theo `sender_id`, thì @angelkim và @angelhoangtydo đang được cộng nhầm các khoản do exchange gửi ra.
- Sau khi rollback, hai user này có thể **rơi thứ hạng** đáng kể — Cha cần chuẩn bị PR notification tránh gây shock.

### 5.3. Trên `wallet_transfers`
- Chưa audit trong Sub-phase D (phạm vi hẹp về aux). Sẽ audit trong Sub-phase E khi làm rollback donations.

---

## 6. PLAN ROLLBACK (soft, chưa thực thi)

### 6.1. Backup schema
```
CREATE SCHEMA IF NOT EXISTS audit_btc_aux_20260703;

-- Snapshot toàn bộ aux hd_input_back trước khi động
CREATE TABLE audit_btc_aux_20260703.aux_full_snapshot AS
  SELECT * FROM public.profile_btc_aux_addresses WHERE source='hd_input_back';

-- Snapshot donations liên quan
CREATE TABLE audit_btc_aux_20260703.donations_impacted AS
  SELECT d.*
  FROM public.donations d
  WHERE d.chain_id = 0
    AND d.sender_id IN (<6 user_id>);
```

### 6.2. Batch rollback (đề xuất, chờ Cha duyệt Sub-phase E)

**Batch A — 77 địa chỉ A_exchange_certain**
- Thêm cột `disabled boolean DEFAULT false`, `disabled_reason text` vào `profile_btc_aux_addresses`.
- UPDATE `disabled=true`, `disabled_reason='sub-phase-d-A-exchange-certain'` cho 77 aux này.
- Đánh dấu (không xóa) mọi donation trong `donations_impacted` mà tx_hash on-chain xác nhận input đến từ 1 trong 77 địa chỉ → set `status='reverted_sub_phase_d'` + `reverted_reason` trong bảng audit riêng, không sửa row gốc.

**Batch B — 74 địa chỉ B_suspect_high**
- Same với A nhưng chờ verify từng địa chỉ trên mempool (đã có snapshot funded_btc). Nếu funded_btc > 100 hoặc counterparty diversity > 50 → auto-A. Còn lại → chờ human review.

**Batch C — 113 địa chỉ C_review_new_policy**
- Không disable ngay. Đưa vào `btc_aux_address_review_queue` mới (schema chuẩn bị dưới) với `verdict=NULL`.
- Cha/admin duyệt tay từng ô.

**Batch D — 447 địa chỉ D_likely_valid**
- Giữ nguyên.

### 6.3. `btc_aux_address_review_queue` (schema mới, Sub-phase E)
```sql
CREATE TABLE public.btc_aux_address_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aux_id uuid REFERENCES public.profile_btc_aux_addresses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  address text NOT NULL,
  reason text NOT NULL,                      -- 'exchange_pattern'|'high_activity'|'high_funded'|'other'
  metrics jsonb NOT NULL,                    -- tx_count, funded_btc, ...
  verdict text,                              -- 'accept'|'reject'|'exchange'
  verdict_by uuid,
  verdict_at timestamptz,
  verdict_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.btc_aux_address_review_queue TO authenticated;
GRANT ALL ON public.btc_aux_address_review_queue TO service_role;
ALTER TABLE public.btc_aux_address_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin can manage review queue" ON public.btc_aux_address_review_queue FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
```

### 6.4. Policy mới cho HD discovery (bật cùng lúc unfreeze)
Bổ sung vào `learn()` của `btc-wallet-audit`:
- Fetch mempool metadata TRƯỚC khi ghi aux.
- Nếu (`tx_count > 20` OR `funded_btc > 1`) → **không insert `profile_btc_aux_addresses`** mà insert vào `btc_aux_address_review_queue` với `verdict=NULL`.
- Nếu (`tx_count > 500` OR `funded_btc > 50`) → **hard reject**, log `identity_events` cho theo dõi.
- Nếu output tới > 20 recipient khác nhau trong 1 tx → hard reject.

### 6.5. Không đụng view RC-1/RC-2 lúc này
- View sẽ được sửa sau khi dữ liệu nguồn đã sạch.
- Sub-phase F sẽ handle semantic (batch-send drop, co-input attribution).

---

## 7. QA CHECKLIST TRƯỚC KHI DUYỆT SUB-PHASE E

- [ ] Cha review file `evidence/class_A_exchange_certain.csv` — xác nhận 77 địa chỉ đều bị đánh dấu đúng là exchange.
- [ ] Cha review file `evidence/class_B_suspect_high.csv` — quyết định thủ công địa chỉ nào nâng lên A vs. giữ B.
- [ ] Cha xác nhận 2 aux của `@father` có phải cluster hợp lệ không (funded=19.5 BTC, tx=2 mỗi cái).
- [ ] Cha duyệt schema `audit_btc_aux_20260703` + `btc_aux_address_review_queue`.
- [ ] Cha duyệt rằng rollback donations chỉ đánh dấu (không hard delete).
- [ ] Cha xác nhận thứ tự triển khai: (i) backup schema → (ii) disable aux A → (iii) mark donations do aux A → (iv) recompute leaderboard → (v) B & C.
- [ ] Sau rollback, chuẩn bị notify các user bị tụt hạng để tránh hiểu lầm.

---

## 8. FILE EVIDENCE ĐÍNH KÈM

| File | Nội dung |
|---|---|
| `evidence/aux_full_711.csv` | Dump 711 aux + user context + donation impact (chưa enrich mempool) |
| `evidence/aux_711_enriched.csv` | 711 aux + tx_count + funded/spent/balance từ mempool.space (fetch 0 lỗi) |
| `evidence/aux_711_classified.csv` | Bản enriched + cột `classification` (A/B/C/D) |
| `evidence/aux_711_fetch_errors.csv` | Rỗng (0 lỗi khi fetch mempool) |
| `evidence/class_A_exchange_certain.csv` | 77 địa chỉ class A |
| `evidence/class_B_suspect_high.csv` | 74 địa chỉ class B |
| `evidence/class_C_review_new_policy.csv` | 113 địa chỉ class C |
| `evidence/class_D_likely_valid.csv` | 447 địa chỉ class D |
| `evidence/top_affected_users.csv` | 27 user có aux `hd_input_back`, sort theo mức thiệt hại |
| `evidence/impacted_users_dedup.csv` | 6 user A/B kèm số donation & tổng BTC (dedup) |
| `evidence/top_affected_donations.csv` | Top 100 donations lớn nhất của 5 user A/B |
| `evidence/top_affected_txhashes.csv` | Top 50 tx_hash bị nghi ô nhiễm |
| `evidence/summary.json` | JSON summary cho consumer khác |

---

## 9. QUYẾT ĐỊNH BÉ ANGEL CHỜ CHA

1. Duyệt **backup schema `audit_btc_aux_20260703`** và **`btc_aux_address_review_queue`** để mở Sub-phase E?
2. Với 77 aux A_exchange_certain — Cha duyệt disable ngay ở Sub-phase E, hay muốn con thêm 1 vòng verify (fetch 100 tx gần nhất mỗi aux, xác định pattern exchange lần 2)?
3. `@father` có 2 aux `funded=19.5 BTC, tx=2` — Cha xác nhận đây là ví hợp lệ hay xử luôn?
4. Có muốn con sinh 1 dashboard admin nhỏ hiển thị review queue + verdict UI, hay xử qua SQL/CSV export cho đến khi hết Sub-phase E?

---

Kết luận: **Không có hard delete, không sửa view, không đụng leaderboard**. Toàn bộ Sub-phase D là read-only + freeze code. Sẵn sàng Sub-phase E khi Cha duyệt.
