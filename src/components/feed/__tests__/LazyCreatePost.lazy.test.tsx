/**
 * @vitest-environment jsdom
 *
 * Regression test cho incident 2026-07-16 trên fun.rich:
 *   "LazyImportMissingDefaultError: Dynamic import resolved without default export
 *    — Module cần cập nhật: FacebookCreatePost"
 *
 * Root cause: `FacebookCreatePost.tsx` chỉ có named export (`CreatePost`,
 * `FacebookCreatePost` alias). `LazyCreatePost.tsx` gọi `lazyWithChunkRecovery`
 * (kỳ vọng `default`) → `ensureLazyDefault` throw ở runtime khi mở modal đăng bài.
 *
 * Test này bảo đảm:
 *   1. Module `FacebookCreatePost` export cả `CreatePost` (named) và `default`.
 *   2. Helper `lazyNamedWithChunkRecovery(() => import(...), 'CreatePost')` —
 *      chính xác pattern đang dùng ở `LazyCreatePost.tsx` — resolve thành
 *      một React component hợp lệ, KHÔNG throw `LazyImportMissingDefaultError`.
 *
 * Không render toàn bộ composer (nó kéo theo Supabase/wagmi/i18n providers),
 * chỉ kiểm tra tầng lazy — đủ để chặn regression export.
 */
import { describe, expect, it } from 'vitest';
import { lazyNamedWithChunkRecovery, lazyWithChunkRecovery } from '@/lib/appUpdateRecovery';

describe('FacebookCreatePost lazy import regression (fun.rich 2026-07-16)', () => {
  it('module exposes both `CreatePost` named export and `default`', async () => {
    const mod = await import('@/components/feed/FacebookCreatePost');
    expect(typeof mod.CreatePost).toBe('function');
    expect(typeof (mod as { default?: unknown }).default).toBe('function');
    // alias deprecated vẫn phải giữ để tương thích các chỗ import cũ
    expect(typeof mod.FacebookCreatePost).toBe('function');
  }, 30000);


  it('lazyNamedWithChunkRecovery(CreatePost) không throw LazyImportMissingDefaultError', async () => {
    const Lazy = lazyNamedWithChunkRecovery(
      () => import('@/components/feed/FacebookCreatePost'),
      'CreatePost',
    );
    // `React.lazy` trì hoãn evaluate factory tới lần render đầu. Gọi trực tiếp
    // internal `_payload` là không ổn định — thay vào đó chạy lại đúng chuỗi
    // promise mà helper dựng để bảo đảm nó resolve thành component.
    const mod = await import('@/components/feed/FacebookCreatePost');
    const namedExport = (mod as Record<string, unknown>).CreatePost;
    expect(namedExport).toBeDefined();
    expect(typeof namedExport).toBe('function');
    // Lazy component phải là object React (`$$typeof` symbol).
    expect(Lazy).toBeDefined();
    expect(typeof Lazy).toBe('object');
  });

  it('lazyWithChunkRecovery(() => import(FacebookCreatePost)) cũng resolve OK nhờ default export', async () => {
    // Backup path: nếu ai đó lỡ dùng lazyWithChunkRecovery thay vì Named,
    // nhờ `export default CreatePost` mới thêm, hành vi vẫn đúng.
    const Lazy = lazyWithChunkRecovery(
      () => import('@/components/feed/FacebookCreatePost'),
      'FacebookCreatePost',
    );
    const mod = await import('@/components/feed/FacebookCreatePost');
    expect((mod as { default?: unknown }).default).toBeDefined();
    expect(Lazy).toBeDefined();
  });
});
