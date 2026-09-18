/**
 * Route constants — Single source of truth for all route paths.
 * Import these instead of hardcoding path strings.
 */

export const ROUTES = {
  // Auth
  AUTH: '/auth',
  SET_PASSWORD: '/set-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  LAW_OF_LIGHT: '/law-of-light',

  // Main
  FEED: '/',
  FRIENDS: '/friends',
  PROFILE: '/profile',
  PROFILE_BY_ID: (id: string) => `/profile/${id}`,
  PROFILE_BY_USERNAME: (username: string) => `/@${username}`,
  CONNECTED_APPS: '/profile/connected-apps',

  // Wallet
  WALLET: '/wallet',
  WALLET_FUN_MONEY: '/wallet/fun_money',

  // Content
  POST: (id: string) => `/post/${id}`,
  POST_CANONICAL: (username: string, publicId: string) => `/${username}/posts/${publicId}`,
  POST_SHARE: (shareCode: string) => `/p/${shareCode}`,
  POST_BY_SLUG: (username: string, slug: string) => `/${username}/post/${slug}`,
  REELS: '/reels',
  REEL: (id: string) => `/reels/${id}`,
  REEL_BY_SLUG: (username: string, slug: string) => `/${username}/video/${slug}`,

  // Social
  CHAT: '/chat',
  CHAT_CONVERSATION: (id: string) => `/chat/${id}`,
  NOTIFICATIONS: '/notifications',
  DONATIONS: '/donations',
  BENEFACTORS: '/benefactors',
  USERS: '/users',
  LEADERBOARD: '/leaderboard',

  // Live
  LIVE: '/live',
  LIVE_SETUP: '/live/setup',
  LIVE_NEW: '/live/new',
  LIVE_SESSION: (id: string) => `/live/${id}`,
  LIVE_HOST: (id: string) => `/live/${id}/host`,
  LIVE_BY_SLUG: (username: string, slug: string) => `/${username}/live/${slug}`,

  // Settings & Admin
  SETTINGS: '/settings',
  SETTINGS_TAB: (tab: string) => `/settings/${tab}`,
  ADMIN: '/admin',
  ADMIN_MIGRATION: '/admin/migration',

  // Misc
  ABOUT: '/about',
  INSTALL: '/install',
  DOCS: '/docs',
} as const;
