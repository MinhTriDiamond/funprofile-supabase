/**
 * Bảng cha logic cho các route con — dùng cho nút Back để biết "màn hình cha".
 * Thứ tự khai báo = thứ tự ưu tiên (match đầu tiên thắng).
 */
export const PARENT_ROUTE_MAP: Array<{ match: RegExp; parent: string }> = [
  // Pet / Mini Game cluster
  { match: /^\/pet\/shop$/, parent: '/pet' },
  { match: /^\/pet\/arena$/, parent: '/pet' },
  { match: /^\/pet\/appeal$/, parent: '/pet' },
  { match: /^\/mystery-box$/, parent: '/pet' },
  { match: /^\/quests$/, parent: '/pet' },

  // Identity
  { match: /^\/identity\/onboarding$/, parent: '/identity' },
  { match: /^\/identity\/.+$/, parent: '/' },
  { match: /^\/identity$/, parent: '/' },

  // Connector
  { match: /^\/connector\/.+$/, parent: '/connector' },

  // Settings
  { match: /^\/settings\/.+$/, parent: '/settings' },

  // Wallet
  { match: /^\/wallet\/.+$/, parent: '/wallet' },

  // Docs
  { match: /^\/docs\/.+$/, parent: '/' },

  // Profile sub
  { match: /^\/profile\/connected-apps$/, parent: '/profile' },
];

export function getParentRoute(pathname: string): string | null {
  for (const rule of PARENT_ROUTE_MAP) {
    if (rule.match.test(pathname)) return rule.parent;
  }
  return null;
}
