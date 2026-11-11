# Hồ sơ — Sập trang khi đăng bài trên Android (`removeChild` NotFoundError) — 2026-11-09

Người thực hiện: Quang Vũ cùng Angel Muse. Nhánh: `fix/quangvu-twcpost-removechild-crash`.

## 1. Hiện tượng

- Thành viên nước ngoài đăng bài trên `fun.rich/?compose=post` bằng **Chrome trên Android** → toàn trang bị thay bằng màn
  hình lỗi:
  `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.`
  (stack chỉ có `vendor-react`).
- Người báo: *"I always face difficulties while posting on FUN.rich most especially when in English language."*
  ⇒ lỗi **lặp lại mỗi lần đăng**, không phải sự cố mạng thoáng qua.

## 2. Nguyên nhân gốc — lỗi của chính app, không phải Google Translate

`src/components/ui/TwemojiImage.tsx` (bản cũ):

```tsx
onError={(e) => {
  const span = document.createElement('span');
  span.textContent = emoji;
  e.currentTarget.replaceWith(span);   // ← gỡ node do React quản lý
}}
```

`replaceWith` **gỡ thẻ `<img>` mà React đang sở hữu** khỏi cây DOM và để một `<span>` do code tay tạo vào chỗ đó.
React vẫn giữ tham chiếu tới `<img>` cũ. Lần render/unmount kế tiếp React gọi `parent.removeChild(img)` — nhưng `img`
không còn là con của `parent` nữa ⇒ đúng `NotFoundError` trong ảnh chụp ⇒ ErrorBoundary bắt và hiện màn hình lỗi.

Vì sao rơi đúng vào lúc **đăng bài**: composer nằm trong Dialog; bấm "Đăng" thì dialog **unmount** (React gỡ cả cây),
và ngay sau đó feed chèn bài mới. Cây DOM đã bị sửa tay từ trước ⇒ sập đúng nhịp đó.

Vì sao **người dùng mobile/nước ngoài** dễ dính:
- `getTwemojiUrl` trỏ tới Twemoji **14.0.2** — thiếu emoji Unicode 15/15.1 mới (bàn phím Android đời mới hay dùng)
  ⇒ ảnh 404 ⇒ `onError` chạy.
- Composer có `EmojiPicker` và `StickerPicker` render **hàng chục** `TwemojiImage` một lúc; trên 4G yếu thì nhiều ảnh
  lỗi/tải chậm ⇒ nhiều node bị thay tay ⇒ xác suất sập cao.
- Thêm lớp thứ hai: **dịch trang** (Google Translate) cũng tự bọc text node bằng `<font>`, tạo ra đúng loại lệch cây
  DOM này cho mọi node khác.

## 3. Vì sao bản vá 2026-10-22 (PR #16) chưa đủ

Bản vá đó (1) ghi rõ nguyên nhân chỉ là **giả thuyết** "Chrome Translate / extension", (2) chỉ thêm **tự phục hồi bằng
reload** khi gặp nhóm lỗi DOM, và để mở việc "xác nhận cuối cùng từ người báo lỗi". Người dùng vẫn gặp lại vì app tiếp
tục tự phá cây DOM ở mỗi lần ảnh emoji lỗi — reload chỉ là chữa cháy, và làm mất nội dung đang soạn.

## 4. Thay đổi

| Tệp | Thay đổi |
|---|---|
| `src/components/ui/TwemojiImage.tsx` | **Vá gốc**: bỏ `replaceWith` bằng tay; ảnh lỗi thì chuyển sang render emoji gốc bằng **React state**. Không còn node nào bị gỡ ngoài tầm kiểm soát của React. |
| `src/lib/translateSafeDom.ts` | **Mới** — guard cho `removeChild`/`insertBefore`: chỉ can thiệp khi cây DOM đã lệch (node bị dịch trang/extension di chuyển), gỡ ở node cha thật hoặc chuyển thành `appendChild` thay vì ném lỗi. Trường hợp bình thường đi y nguyên đường gốc của trình duyệt. |
| `src/main.tsx` | Cài guard **trước** `createRoot` để mọi commit của React đều đi qua. |
| `src/components/ErrorBoundary.tsx` | Không phơi `message` + `stack` JS cho người dùng cuối nữa: chỉ hiện ở môi trường dev hoặc khi bật cờ `fun_profile_debug = '1'` trong localStorage. Chẩn đoán vẫn ghi đầy đủ ra console qua `getErrorDiagnostics()`. |
| `src/lib/translateSafeDom.test.ts` | **Mới** — 7 test. |
| `src/components/ui/__tests__/TwemojiImage.render.test.tsx` | **Mới** — 4 test, có test mô phỏng đúng cách cũ để chứng minh nó ném lỗi. |

Không đụng: luồng upload ảnh/video, luồng đăng bài, database, Edge Function. Không có migration.
Không chặn dịch toàn trang (thành viên nước ngoài cần dịch để đọc nội dung tiếng Việt).

## 5. Kiểm chứng

- `bunx vitest run src/lib/translateSafeDom.test.ts src/components/ui/__tests__/TwemojiImage.render.test.tsx` → **11 test đạt**.
- Trong đó có 2 test "chứng minh ngược":
  - `native removeChild` ném lỗi khi node đã bị bọc ra ngoài (tức guard là thứ thật sự chặn sự cố).
  - Mô phỏng lại `replaceWith` của code cũ ⇒ `unmount()` **ném đúng `NotFoundError`**; còn code mới thì không.
- `bunx vitest run` toàn repo → **501 đạt, 30 skip**, 1 file lỗi `prices-unavailable.render.test.tsx` là **lỗi có sẵn** (đã
  kiểm chứng bằng `git stash` trước khi sửa).
- `bunx --package @typescript/native-preview tsgo --noEmit` → exit 0.

Kiểm chứng thực tế sau khi lên sóng: trên Chrome Android, mở composer → mở bảng emoji/sticker → bấm "Đăng".
Trước: văng màn hình lỗi. Sau: bài đăng bình thường (emoji nào không tải được chỉ hiện emoji gốc).

## 6. Phát hành

- PR: **#52** — https://github.com/MinhTriDiamond/funprofile-supabase/pull/52 (nhánh `fix/quangvu-twcpost-removechild-crash`).
- **Đã merge** (squash) vào `main` ngày 2026-11-09: commit `5cebb18`.
- Chỉ **frontend** ⇒ merge là Cloudflare Pages tự build và deploy lên `fun.rich`; không cần deploy Edge Function,
  không cần Publish Lovable, không migration.
- **Kiểm chứng bản build chứa bản vá** (dùng marker `__funProfileDomGuard` trong `src/lib/translateSafeDom.ts`):
  - Preview nhánh: `https://fix-quangvu-twcpost-removech.funprofile-supabase.pages.dev` → `index-DTFlLdN4.js` có marker.
  - **Production:** `fun.rich` phục vụ `/assets/index-DTFlLdN4.js` — **có marker** ⇒ bản vá đã sống, không chỉ nằm
    trong repo.

## 7. Cách khôi phục

Revert commit của nhánh này. Không có thay đổi DB/secret nên không cần rollback dữ liệu.

## 8. Giới hạn còn lại

- Ảnh Twemoji vẫn có thể lỗi (emoji mới hơn bộ 14.0.2, mạng yếu); nay chỉ **hạ cấp hiển thị** về emoji gốc của hệ
  điều hành, không còn rủi ro sập trang.
- Guard chỉ bảo hiểm nhóm lỗi `removeChild`/`insertBefore`. Các lỗi DOM khác (nếu có) vẫn do ErrorBoundary xử lý.
- Chưa xác nhận được trên chính máy của người báo lỗi; nên nhờ họ thử lại sau khi lên sóng.
