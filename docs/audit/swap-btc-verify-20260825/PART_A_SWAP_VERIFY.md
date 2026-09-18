# PHẦN A — Verify runtime Swap (2026-08-25)

## A1. Liệt kê ĐỦ 8 nhánh (không gộp, không làm tròn)

Báo cáo trước đếm **5 vùng nuốt lỗi** (5 khối `catch`/`if` đã grep được). Khi code
thực tế, mỗi khối được tách theo **verdict riêng** nên thành 8 `stage`. Chi tiết
`supabase/functions/record-swap/index.ts` (bản hiện tại):

| # | stage | dòng | Thuộc nhánh cũ nào |
|---|---|---|---|
| 1 | `invalid_body` | 75–82 (`catch` parse JSON → `logFailure` :76) | nhánh cũ 38–42 (parse body) |
| 2 | `validation` | 83–90 (`if (!parsed.ok)` → :84) | nhánh cũ 38–42 (cùng khối input) |
| 3 | `verify_provider_error` | 142–150 (`catch` provider → :145) | nhánh cũ 99–102 |
| 4 | `invalid_tx` | 152–158 (:155) | nhánh cũ 104–110 (tách verdict) |
| 5 | `verify_transient` | 159–166 (:161) | nhánh cũ 104–110 (tách verdict) |
| 6 | `insert_error` | 196–204 (:198) | nhánh cũ 147–166 |
| 7 | `audit_log` | 225–238 (2 call site :227 và :233 — cùng 1 stage) | nhánh cũ 169–172 |
| 8 | `unhandled` | 240–246 (:242) | **MỚI** — catch ngoài cùng, trước đây chỉ `console.error` |

⇒ Kết luận chính xác: **5 nhánh cũ được tách thành 7 stage** (nhánh cũ `104–110`
tách 2, nhánh cũ `38–42` tách 2) **+ 1 nhánh mới phát hiện khi code** (`unhandled`).
Không phải "5 + 3". Số call site `logFailure` = 9 (vì `audit_log` có 2 điểm gọi),
số stage = 8. Đây là sai lệch **cách đếm**, đã hiệu chỉnh tại đây.

## A2. GRANT + RLS bảng `swap_failures` — nguyên văn

Migration `20260824144534_1ffb54f3-…sql`:

```sql
GRANT SELECT ON public.swap_failures TO authenticated;
GRANT ALL ON public.swap_failures TO service_role;

ALTER TABLE public.swap_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view swap failures"
ON public.swap_failures FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
```

`pg_policies` runtime — đúng 1 policy:
`Admins can view swap failures | SELECT | {authenticated} | has_role(auth.uid(), 'admin'::app_role)`.

### PHÁT HIỆN NGOÀI DỰ KIẾN (P2, chưa sửa — chờ CTO duyệt vì đụng schema)

`relacl` thực tế của bảng:

```
{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
 service_role=arwdDxtm/postgres, sandbox_exec…=ar/postgres}
```

⇒ Có **default privileges cấp toàn quyền cho `anon` + `authenticated`** ở schema
`public` của dự án này (không do migration của ta cấp). Migration ta viết không
cấp `anon`, nhưng default privileges vẫn phủ. **RLS vẫn chặn** (bằng chứng runtime
A2-runtime dưới), nên KHÔNG rò dữ liệu; tuy vậy grant rộng hơn ý định ⇒ đề xuất
`REVOKE ALL ON public.swap_failures FROM anon;` + `REVOKE INSERT,UPDATE,DELETE …
FROM authenticated;` (chờ duyệt).

### A2-runtime (verify thật, không tin theo tên)

| Thao tác | Kết quả |
|---|---|
| `GET /rest/v1/swap_failures?select=id` với publishable key (anon) | **200 `[]`** — RLS chặn hết dòng, không lộ dữ liệu (lúc test bảng có 1 dòng probe) |
| `POST /rest/v1/swap_failures` với anon | **401** `42501 new row violates row-level security policy` |
| Đọc bằng JWT admin thật | **CHƯA verify được** — sandbox `LOVABLE_BROWSER_AUTH_STATUS=signed_out`, không có JWT admin. Chờ Cha đăng nhập preview để Lovable verify nhánh này. |

## A3. Edge `log-swap-failure` — trích đoạn xác nhận

```ts
import { corsHeaders, json, requireUser, createAdminClient, normalizeError }
  from '../_shared/httpAuth.ts';

const ALLOWED_STAGES = new Set(['client_record_failed', 'client_retry_failed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const user = await requireUser(req);
  …
  const stage = String(body.stage ?? 'client_record_failed');
  if (!ALLOWED_STAGES.has(stage)) return json({ error: 'invalid_stage' }, 400);
  const txHash = body.tx_hash ? String(body.tx_hash).slice(0, 100) : null;
  const chainIdRaw = Number(body.chain_id);
  const chainId = Number.isInteger(chainIdRaw) ? chainIdRaw : null;
  const errorMessage = body.error_message ? String(body.error_message).slice(0, 2000) : null;
```

⇒ Có OPTIONS ✔ · đi qua `_shared/httpAuth.ts` (`requireUser`, `createAdminClient`) ✔
· validate whitelist stage + cắt độ dài + ép kiểu số ✔ · `user_id` lấy từ JWT (client
không tự khai được) ✔.

## A4. Verify runtime chuỗi ghi log

| Bước | Cách test | Kết quả |
|---|---|---|
| CORS preflight | `OPTIONS /functions/v1/log-swap-failure` | **200** |
| Chặn không JWT | `POST` chỉ có apikey | **401** `Thiếu Authorization header` |
| Chặn stage lạ / token không hợp lệ | `POST` với `Bearer <publishable>` + `stage:"hacker"` | **401** `This endpoint requires a valid Bearer token` (gateway chặn trước, whitelist stage là lớp 2) |
| Ghi thật vào bảng + dedup | gọi `log_swap_failure('verify_probe','0xVERIFYPROBE…',56,…)` **2 lần** | **1 dòng duy nhất**, `attempts = 2`, `first/last_failed_at` đúng ⇒ unique index dedup hoạt động |
| Badge đếm | query giống `SwapFailuresBadge` (`last_failed_at >= now()-30d`) | trả 1 dòng ⇒ badge hiển thị `Swap lỗi: 1 (7đ) · 1 (30đ) · 2 lần · mới nhất: verify_probe` |
| Dọn | `DELETE … stage='verify_probe'` | đã xoá, bảng về 0 dòng |

**Giới hạn trung thực:** nhánh "FE lỗi thật → invoke edge với JWT user" chưa chạy
được end-to-end vì không có phiên đăng nhập trong sandbox. Đã verify: FE có gọi
(`SwapTab.tsx:216`), edge nhận/validate đúng, RPC ghi + dedup đúng, badge đếm đúng.
Mắt còn thiếu duy nhất: 1 lần bấm swap lỗi thật từ trình duyệt của user.
