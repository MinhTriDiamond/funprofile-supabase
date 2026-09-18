# Fun Agora RTC Token + Live Recording Worker

Cloudflare Worker đa chức năng:
1. **Tạo Agora RTC token** cho video/voice call
2. **Upload live video chunks** lên R2
3. **Ghép chunks** thành file hoàn chỉnh

---

## Yêu cầu

- Node.js >= 18
- Cloudflare account (free tier OK)
- Agora account (App ID + App Certificate)
- Cloudflare R2 bucket (cho live recording)

---

## Hướng dẫn Deploy từ đầu (Step-by-step)

### Bước 1: Cài đặt Wrangler CLI

```bash
npm install -g wrangler
```

### Bước 2: Đăng nhập Cloudflare

```bash
wrangler login
# Trình duyệt sẽ mở → Cho phép quyền truy cập
```

### Bước 3: Tạo R2 Bucket

```bash
wrangler r2 bucket create fun-live-chunks
```

Hoặc tạo trên [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2 → Create bucket → Tên: `fun-live-chunks`

### Bước 4: Cấu hình Custom Domain cho R2 (tùy chọn)

Nếu muốn dùng domain riêng (ví dụ `media.fun.rich`):
1. Vào Cloudflare Dashboard → R2 → `fun-live-chunks` → Settings
2. Public access → Custom Domain → Thêm `media.fun.rich`
3. Bật "Allow public access"

### Bước 5: Cài đặt dependencies

```bash
cd fun-agora-rtc-token
npm install
```

### Bước 6: Cấu hình Secrets

```bash
# === Agora credentials ===
# Lấy từ https://console.agora.io/ → Project → App ID
npx wrangler secret put AGORA_APP_ID
# → Paste App ID

# Lấy từ Agora Console → Security → Primary Certificate
npx wrangler secret put AGORA_APP_CERTIFICATE
# → Paste Certificate

# === API Key (tự tạo, >= 32 ký tự) ===
# Dùng lệnh: openssl rand -hex 32
npx wrangler secret put API_KEY
# → Paste API key

# === Supabase credentials (cho xác thực upload) ===
# Lấy từ Supabase Dashboard → Settings → API
npx wrangler secret put SUPABASE_URL
# → Paste URL (ví dụ: https://xxxxx.supabase.co)

npx wrangler secret put SUPABASE_ANON_KEY
# → Paste anon/public key

# === R2 Public URL ===
# URL công khai của R2 bucket (custom domain hoặc r2.dev URL)
npx wrangler secret put R2_PUBLIC_URL
# → Paste URL (ví dụ: https://media.fun.rich)
```

### Bước 7: Deploy

```bash
npm run deploy
```

Worker sẽ được deploy tại: `https://fun-agora-rtc-token.<your-subdomain>.workers.dev`

### Bước 8: Cập nhật Frontend

Đảm bảo các secrets sau đã được cấu hình trong backend:
- **AGORA_WORKER_URL**: URL của worker (ví dụ: `https://fun-agora-rtc-token.your-subdomain.workers.dev`)
- **AGORA_WORKER_API_KEY**: Chính là API_KEY đã tạo ở bước 6

---

## API Endpoints

### 1. POST `/` — Tạo Agora RTC Token

**Headers:**
```
Content-Type: application/json
X-API-Key: <API_KEY>
```

**Body:**
```json
{
  "channelName": "test-channel",
  "uid": "user-uuid-123",
  "role": "publisher"
}
```

**Response:**
```json
{
  "token": "007eJxT...",
  "app_id": "your_app_id",
  "uid": "user-uuid-123",
  "channel": "test-channel",
  "expires_at": 1234567890
}
```

### 2. POST `/upload/live-chunk` — Upload Video Chunk

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
X-Stream-Id: <live_session_id>
X-Chunk-Index: 0
Content-Type: application/octet-stream
```

**Body:** Binary video data (max 10MB)

**Response:**
```json
{
  "ok": true,
  "key": "live-chunks/abc123/chunk-00000.webm",
  "bytes": 524288
}
```

### 3. POST `/upload/live-finalize` — Ghép Chunks

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "streamId": "abc123",
  "totalChunks": 15
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://media.fun.rich/videos/live/abc123/recording-1234567890.webm",
  "key": "videos/live/abc123/recording-1234567890.webm",
  "bytes": 7864320,
  "chunks": 15
}
```

---

## Cấu trúc R2

```
R2 Bucket: fun-live-chunks
├── live-chunks/{streamId}/         ← chunks tạm (bị xóa sau finalize)
│   ├── chunk-00000.webm
│   ├── chunk-00001.webm
│   └── ...
└── videos/live/{streamId}/         ← file cuối cùng (vĩnh viễn)
    └── recording-{timestamp}.webm
```

---

## Cấu trúc code

```
src/
  index.ts      - Multi-route entry point (token + upload + finalize)
  auth.ts       - Supabase JWT verification
  cors.ts       - CORS middleware
  validate.ts   - Input validation (token route)
```

---

## Test

```bash
# Test token generation
curl -X POST https://fun-agora-rtc-token.<subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY>" \
  -d '{"channelName": "test", "uid": "user123", "role": "publisher"}'

# Test chunk upload (cần Supabase JWT)
curl -X POST https://fun-agora-rtc-token.<subdomain>.workers.dev/upload/live-chunk \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Stream-Id: test-stream" \
  -H "X-Chunk-Index: 0" \
  --data-binary @chunk.webm

# Test finalize
curl -X POST https://fun-agora-rtc-token.<subdomain>.workers.dev/upload/live-finalize \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"streamId": "test-stream", "totalChunks": 1}'
```

---

## Dev local

```bash
npm run dev
# Worker chạy tại http://localhost:8787
```

**Lưu ý:** Khi dev local, R2 binding sẽ dùng local storage emulation của Wrangler.
