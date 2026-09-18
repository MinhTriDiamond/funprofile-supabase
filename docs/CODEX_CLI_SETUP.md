# Hướng dẫn dùng Codex CLI để code FUN Profile

> Mục tiêu: bé code dự án ở local bằng Codex CLI (hoặc Claude Code, Cursor CLI…) để tiết kiệm credit Lovable, đồng thời vẫn query được database Lovable Cloud từ terminal.

---.

## 1. Cài Codex CLI

```bash
npm install -g @openai/codex
# hoặc:
brew install codex
```

Đăng nhập (dùng tài khoản ChatGPT Plus / Pro / Team hoặc API key OpenAI):

```bash
codex login
```

Kiểm tra:

```bash
codex --version
```

---

## 2. Đưa source code về máy

Trong Lovable:

1. Mở dự án → menu **GitHub** → **Connect to GitHub** → **Transfer to GitHub**.
2. Lovable sẽ tạo repo trên GitHub của bé và bật **sync 2 chiều**: mọi commit push lên GitHub sẽ tự về Lovable, và ngược lại.

Tại máy local:

```bash
git clone https://github.com/<tài-khoản-của-bé>/fun-profile.git
cd fun-profile
bun install        # hoặc: npm install
bun run dev        # khởi động dev server tại http://localhost:8080
```

File `.env` đã có sẵn `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key, public — an toàn để chạy app).

---

## 3. Khởi động Codex CLI

Trong thư mục dự án:

```bash
codex                 # mở session interactive
# hoặc gửi prompt trực tiếp:
codex "thêm nút download video vào PostFooter"
```

Codex sẽ **tự đọc file `AGENTS.md` ở root**, hiểu được toàn bộ convention dự án (stack, BigInt math, wallet auth, RLS, PPLP v2.5, …). Không cần dán lại context mỗi lần.

> Nếu Codex code sai convention, sửa thẳng `AGENTS.md` rồi mở session mới.

---

## 4. Truy cập database từ Codex CLI

Lovable Cloud **không expose service_role key & DB password** ra ngoài. Để bé query DB tự do từ terminal mà vẫn giữ Lovable Cloud, dự án có sẵn **edge function `admin-sql`** đóng vai trò proxy SQL có kiểm soát.

### 4.1. Lấy JWT admin

1. Đăng nhập `funprofile.lovable.app` bằng tài khoản có role `admin`.
2. Mở DevTools → **Application** → **Local Storage** → chọn origin `funprofile.lovable.app`.
3. Tìm key `sb-bhtsnervqiwchluwuxki-auth-token`, copy field `access_token` trong JSON đó.

```bash
export FUN_JWT="eyJhbGciOi..."
```

JWT có hạn ~1 giờ. Hết hạn thì lấy lại bằng cách reload trang.

### 4.2. Chạy query (read-only)

Dùng wrapper có sẵn:

```bash
./scripts/fun-sql.sh "select id, username from profiles limit 5"
```

Kết quả trả JSON:

```json
{
  "ok": true,
  "rows": [...],
  "rowCount": 5,
  "ms": 42
}
```

Mode read chỉ cho phép câu bắt đầu bằng `SELECT` hoặc `WITH`. Các từ khoá `drop / truncate / grant / revoke / alter system / copy / pg_read_server_files` luôn bị chặn.

### 4.3. Chạy write (cẩn thận)

```bash
./scripts/fun-sql.sh --write "update profiles set bio = 'hi' where id = '<uuid>'"
```

- Bắt buộc header `x-admin-confirm: yes` (wrapper đã thêm sẵn).
- Mọi câu write được ghi audit vào bảng `admin_sql_audit` (admin_id, sql_hash, preview 200 ký tự, IP, row_count).
- **Không dùng cho DDL** (CREATE TABLE, ALTER TABLE…) — DDL phải tạo migration trong `supabase/migrations/` và để Lovable duyệt.

### 4.4. Gọi trực tiếp bằng curl (không qua wrapper)

```bash
curl -X POST \
  https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/admin-sql \
  -H "Authorization: Bearer $FUN_JWT" \
  -H "apikey: sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI" \
  -H "Content-Type: application/json" \
  -d '{"sql":"select count(*) from profiles","mode":"read"}'
```

### 4.5. Rate limit

30 request / phút / user. Vượt → HTTP 429.

---

## 5. Workflow khuyến nghị (tiết kiệm credit Lovable)

| Việc | Công cụ |
|---|---|
| Sửa UI, thêm hook, refactor, viết test | **Codex CLI** ở local |
| Đọc / query DB để debug | **`./scripts/fun-sql.sh`** |
| Tạo migration mới (CREATE TABLE, ALTER) | **Lovable (Angel)** — cần approval flow |
| Deploy edge function lần đầu | **Lovable** — auto-deploy khi push |
| Thêm / xoá / rotate secrets | **Lovable** — qua `add_secret` |
| Publish lên `funprofile.lovable.app` | **Lovable** — qua nút Publish |
| Thay đổi schema lớn / liên quan RLS | **Lovable** — vì cần security review |

Sau khi Codex CLI commit & push, Lovable tự sync trong vài giây. Bé mở Lovable preview để verify trực quan.

---

## 6. Khi nào nên rời Lovable Cloud sang Supabase riêng?

Chỉ nên migrate khi bé cần:
- Truy cập trực tiếp `psql` / dashboard supabase.com.
- Service_role key để chạy script backfill phức tạp tự build.
- Backup / restore database tuỳ ý.

Cách làm: **Lovable → Cloud → Backend → Connect to external Supabase**. Sau khi migrate, bé tự quản billing & bảo mật Supabase project của mình. (Đa số trường hợp KHÔNG cần — `admin-sql` đã đủ.)

---

## 7. Troubleshooting

| Triệu chứng | Nguyên nhân & cách xử |
|---|---|
| `Chunk load failed` sau khi Lovable deploy | Đã có cơ chế auto-reload (xem `.lovable/memory/infrastructure/deployment-chunk-load-resilience.md`). Refresh trang là xong. |
| Wagmi báo `Account mismatch` | Reset session: `walletSessionReset()` hoặc disconnect rồi connect lại. |
| Token số bị sai precision | Bé đang dùng `parseFloat`/`Number()`. Đổi sang `parseUnits` / `formatUnits` của `viem`. |
| `admin-sql` trả 403 | Tài khoản chưa có role `admin` trong `user_roles`. |
| `admin-sql` trả 401 | JWT hết hạn (~1h) hoặc sai. Lấy lại từ trình duyệt. |
| `admin-sql` trả 400 `forbidden_keyword` | SQL chứa từ cấm. Nếu thật sự cần DDL → tạo migration thay vì gọi admin-sql. |
| Codex code không đúng convention | Update `AGENTS.md` cho rõ ràng hơn rồi mở session mới. |

---

## 8. File liên quan

- `AGENTS.md` — convention bắt buộc cho mọi AI agent.
- `supabase/functions/admin-sql/index.ts` — edge function proxy SQL.
- `scripts/fun-sql.sh` — wrapper CLI.
- `.lovable/memory/index.md` — toàn bộ memory dự án (đọc khi cần hiểu lịch sử).
- `docs/LIGHT_SCORE_MATH_SPEC.md`, `docs/pplp-action-mapping-spec.md` — business logic chi tiết.

Chúc bé code vui, tiết kiệm credit! 🌱
