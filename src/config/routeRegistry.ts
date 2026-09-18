/**
 * FUN Profile — Route Registry (Navigation Framework v1.0 — B1 Foundation)
 *
 * NGUỒN TÀI LIỆU DUY NHẤT về toàn bộ route hiện có trong `src/App.tsx`.
 *
 * ⚠️ B1 SCOPE:
 * - File này CHỈ dùng cho tài liệu + validation (vitest).
 * - App.tsx CHƯA import registry — không có side effect runtime.
 * - Migration sang nested layout sẽ thực hiện ở B3.
 *
 * Ràng buộc bất biến:
 * - Entry cuối cùng phải là `:username` (catch-all username). Reserved system
 *   routes phải được kiểm tra TRƯỚC username fallback.
 * - Layout mới ngoài 4 layout (`normal | fullscreen | admin | publicOnly`)
 *   phải được duyệt trước khi thêm.
 */

export type LayoutKind = 'normal' | 'fullscreen' | 'admin' | 'publicOnly';
export type AuthKind = 'guest' | 'user' | 'admin' | 'founder';
export type Domain =
  | 'social'
  | 'finance'
  | 'identity'
  | 'creator'
  | 'game'
  | 'governance'
  | 'admin'
  | 'system';

export interface RouteEntry {
  /** Path literal (có thể chứa :param). Không dấu `/` cuối. */
  path: string;
  /** Layout tương lai (B3 mới apply). B1 chỉ để ghi chú. */
  layout: LayoutKind;
  /** Quyền yêu cầu tối thiểu để vào route. */
  auth: AuthKind;
  /** Nhóm domain phục vụ Information Architecture (Phase D). */
  domain: Domain;
  /** Path cha (để nút Back xác định — khớp `PARENT_ROUTE_MAP`). */
  parent?: string;
  /** Tiêu đề mô tả ngắn. */
  title?: string;
  /** Ghi chú (redirect, alias, đặc thù...). */
  notes?: string;
}

/**
 * Snapshot ngày 2026-07 — phản ánh ĐÚNG hiện trạng `src/App.tsx`.
 * Không mô tả kiến trúc mơ ước. Khi App.tsx đổi, cập nhật file này song song.
 */
export const ROUTE_REGISTRY: RouteEntry[] = [
  // ─── System / Auth ─────────────────────────────────────────────────────
  { path: '/begin', layout: 'publicOnly', auth: 'guest', domain: 'system',
    notes: 'Redirect → /law-of-light' },
  { path: '/law-of-light', layout: 'normal', auth: 'guest', domain: 'system',
    title: 'Luật của Ánh sáng' },
  { path: '/auth', layout: 'publicOnly', auth: 'guest', domain: 'system',
    title: 'Đăng nhập' },
  { path: '/auth/callback', layout: 'publicOnly', auth: 'guest', domain: 'system' },
  { path: '/set-password', layout: 'publicOnly', auth: 'guest', domain: 'system' },
  { path: '/reset-password', layout: 'publicOnly', auth: 'guest', domain: 'system' },
  { path: '/verify-email', layout: 'publicOnly', auth: 'guest', domain: 'system' },
  { path: '/confirm-email', layout: 'publicOnly', auth: 'guest', domain: 'system' },
  { path: '/install', layout: 'normal', auth: 'guest', domain: 'system', title: 'Cài đặt PWA' },
  { path: '/about', layout: 'normal', auth: 'guest', domain: 'system', title: 'Giới thiệu' },
  { path: '/docs/*', layout: 'normal', auth: 'guest', domain: 'system', title: 'Tài liệu' },

  // ─── Social ────────────────────────────────────────────────────────────
  { path: '/', layout: 'normal', auth: 'guest', domain: 'social', title: 'Feed' },
  { path: '/friends', layout: 'normal', auth: 'user', domain: 'social', parent: '/', title: 'Bạn bè' },
  { path: '/users', layout: 'normal', auth: 'user', domain: 'social', parent: '/', title: 'Danh bạ' },
  { path: '/leaderboard', layout: 'normal', auth: 'guest', domain: 'social', parent: '/', title: 'Bảng vinh danh' },
  { path: '/leaderboard/:tab', layout: 'normal', auth: 'guest', domain: 'social', parent: '/leaderboard' },
  { path: '/notifications', layout: 'normal', auth: 'user', domain: 'social', parent: '/', title: 'Thông báo',
    notes: 'B2 sẽ đảm bảo có FacebookNavbar (hiện chưa có trên desktop)' },
  { path: '/chat', layout: 'normal', auth: 'user', domain: 'social', parent: '/', title: 'Trò chuyện' },
  { path: '/chat/:conversationId', layout: 'normal', auth: 'user', domain: 'social', parent: '/chat' },

  // ─── Profile ──────────────────────────────────────────────────────────
  { path: '/profile', layout: 'normal', auth: 'user', domain: 'social', parent: '/', title: 'Hồ sơ của tôi' },
  { path: '/profile/:userId', layout: 'normal', auth: 'guest', domain: 'social', parent: '/' },
  { path: '/profile/connected-apps', layout: 'normal', auth: 'user', domain: 'social', parent: '/profile' },
  { path: '/@:username', layout: 'normal', auth: 'guest', domain: 'social', parent: '/', title: 'Hồ sơ' },
  { path: '/profile/:username/history', layout: 'normal', auth: 'user', domain: 'finance',
    parent: '/@:username', title: 'Lịch sử giao dịch hồ sơ' },

  // ─── Posts & Reels ────────────────────────────────────────────────────
  { path: '/p/:shareCode', layout: 'normal', auth: 'guest', domain: 'social',
    notes: 'ShareRedirect → canonical URL' },
  { path: '/post/:postId', layout: 'normal', auth: 'guest', domain: 'social', parent: '/' },
  { path: '/:username/posts/:publicId', layout: 'normal', auth: 'guest', domain: 'social', parent: '/@:username' },
  { path: '/:username/post/:slug', layout: 'normal', auth: 'guest', domain: 'social', parent: '/@:username' },
  { path: '/reels', layout: 'fullscreen', auth: 'guest', domain: 'creator', parent: '/', title: 'Reels' },
  { path: '/reels/:reelId', layout: 'fullscreen', auth: 'guest', domain: 'creator', parent: '/reels' },
  { path: '/:username/video/:slug', layout: 'fullscreen', auth: 'guest', domain: 'creator', parent: '/@:username' },

  // ─── Finance / Wallet ─────────────────────────────────────────────────
  { path: '/wallet/*', layout: 'normal', auth: 'user', domain: 'finance', parent: '/', title: 'Ví' },
  { path: '/wallet/history', layout: 'normal', auth: 'user', domain: 'finance', parent: '/wallet/*', title: 'Lịch sử giao dịch ví' },
  { path: '/donations', layout: 'normal', auth: 'guest', domain: 'finance', parent: '/', title: 'Quà tặng toàn hệ thống' },
  { path: '/benefactors', layout: 'normal', auth: 'guest', domain: 'finance', parent: '/', title: 'Ân nhân' },
  { path: '/treasury', layout: 'normal', auth: 'guest', domain: 'finance', parent: '/', title: 'Kho bạc công khai' },
  { path: '/mint', layout: 'normal', auth: 'user', domain: 'finance', notes: 'Redirect → /wallet/fun_money' },

  // ─── Identity ─────────────────────────────────────────────────────────
  { path: '/identity', layout: 'normal', auth: 'user', domain: 'identity', parent: '/', title: 'Danh tính' },
  { path: '/identity/:tab', layout: 'normal', auth: 'user', domain: 'identity', parent: '/identity' },
  { path: '/identity/onboarding', layout: 'normal', auth: 'user', domain: 'identity', parent: '/identity' },

  // ─── Connector ────────────────────────────────────────────────────────
  { path: '/connector', layout: 'normal', auth: 'user', domain: 'identity', parent: '/', title: 'Connector' },
  { path: '/connector/given', layout: 'normal', auth: 'user', domain: 'identity', parent: '/connector' },

  // ─── Game / Pet / Quests ──────────────────────────────────────────────
  { path: '/pet', layout: 'normal', auth: 'user', domain: 'game', parent: '/', title: 'Linh thú Lumi',
    notes: 'B2 sẽ đảm bảo có MobileBottomNav' },
  { path: '/pet/shop', layout: 'normal', auth: 'user', domain: 'game', parent: '/pet' },
  { path: '/pet/appeal', layout: 'normal', auth: 'user', domain: 'game', parent: '/pet' },
  { path: '/pet/arena', layout: 'normal', auth: 'user', domain: 'game', parent: '/pet' },
  { path: '/quests', layout: 'normal', auth: 'user', domain: 'game', parent: '/', title: 'Nhiệm vụ' },
  { path: '/mystery-box', layout: 'normal', auth: 'user', domain: 'game', parent: '/pet', title: 'Hộp bí ẩn' },

  // ─── Live ─────────────────────────────────────────────────────────────
  { path: '/live', layout: 'normal', auth: 'guest', domain: 'creator', parent: '/', title: 'Live' },
  { path: '/live/setup', layout: 'fullscreen', auth: 'user', domain: 'creator', parent: '/live' },
  { path: '/live/new', layout: 'fullscreen', auth: 'user', domain: 'creator', parent: '/live' },
  { path: '/live/obs', layout: 'fullscreen', auth: 'user', domain: 'creator', parent: '/live' },
  { path: '/live/obs/:sessionId', layout: 'fullscreen', auth: 'user', domain: 'creator', parent: '/live' },
  { path: '/live/stream', layout: 'fullscreen', auth: 'user', domain: 'creator',
    notes: 'Redirect → /live/new' },
  { path: '/live/:liveSessionId', layout: 'fullscreen', auth: 'guest', domain: 'creator', parent: '/live' },
  { path: '/live/:liveSessionId/host', layout: 'fullscreen', auth: 'user', domain: 'creator', parent: '/live' },
  { path: '/:username/live/:slug', layout: 'fullscreen', auth: 'guest', domain: 'creator', parent: '/@:username' },

  // ─── Settings ─────────────────────────────────────────────────────────
  { path: '/settings', layout: 'normal', auth: 'user', domain: 'system', parent: '/', title: 'Cài đặt' },
  { path: '/settings/:tab', layout: 'normal', auth: 'user', domain: 'system', parent: '/settings' },

  // ─── Admin / Governance ───────────────────────────────────────────────
  { path: '/admin', layout: 'admin', auth: 'admin', domain: 'admin', parent: '/', title: 'Admin' },
  { path: '/admin/migration', layout: 'normal', auth: 'admin', domain: 'admin', parent: '/admin',
    notes: 'B2 sẽ chuyển vào AdminShell' },
  { path: '/admin/replay-debug', layout: 'normal', auth: 'admin', domain: 'admin', parent: '/admin',
    notes: 'B2 sẽ chuyển vào AdminShell' },
  { path: '/admin/kyc', layout: 'normal', auth: 'admin', domain: 'admin', parent: '/admin',
    notes: 'B2 sẽ chuyển vào AdminShell' },
  { path: '/admin/fun-core-debug', layout: 'normal', auth: 'admin', domain: 'admin', parent: '/admin',
    notes: 'B2 sẽ chuyển vào AdminShell' },
  { path: '/founder', layout: 'admin', auth: 'founder', domain: 'governance', parent: '/', title: 'Founder Dashboard',
    notes: 'Giữ path /founder ở top-level, chỉ dùng AdminLayout shell' },

  // ─── CATCH-ALL — MUST BE LAST ─────────────────────────────────────────
  {
    path: ':username',
    layout: 'normal',
    auth: 'guest',
    domain: 'social',
    title: 'Hồ sơ (username fallback)',
    notes:
      'Reserved system routes MUST be checked before username fallback. ' +
      'This MUST remain the final entry in ROUTE_REGISTRY.',
  },
];

/** Tìm entry theo path literal. */
export function findRouteEntry(path: string): RouteEntry | undefined {
  return ROUTE_REGISTRY.find((r) => r.path === path);
}

/** Danh sách system route hiện có — dùng để chặn username collision. */
export function listSystemTopSegments(): string[] {
  const set = new Set<string>();
  for (const r of ROUTE_REGISTRY) {
    if (r.path === ':username') continue;
    const seg = r.path.split('/').filter(Boolean)[0];
    if (seg && !seg.startsWith(':') && !seg.startsWith('@')) set.add(seg);
  }
  return [...set].sort();
}
