/**
 * Navigation Configuration — Single Source of Truth
 * 
 * All navigation components (FacebookNavbar, FacebookLeftSidebar, MobileBottomNav)
 * read from this config to ensure consistent navigation across Desktop/Tablet/Mobile.
 */

import type { Language } from '@/i18n/translations';

// ─── Types ───────────────────────────────────────────────────────

export interface NavItem {
  id: string;
  labelKey: string;         // i18n translation key
  route: string;
  iconName?: string;        // lucide icon identifier (for reference)
  adminOnly?: boolean;
  authRequired?: boolean;
  feature?: string;         // future feature flag support
}

export interface EcosystemItem {
  id: string;
  name: string;
  avatar: string;           // path to logo image
  path: string;
  isExternal: boolean;
  isSpecial?: boolean;
  feature?: string;
}

export interface ShortcutItem {
  id: string;
  labelKey: string;
  route: string;
  iconName: string;
  color: string;            // tailwind text color class
  feature?: string;
}

export interface LanguageOption {
  code: Language;
  name: string;
  fullName: string;
  flagUrl: string;
}

export interface UserMenuItem {
  id: string;
  labelKey: string;
  iconName: string;
  route?: string;
  action?: 'logout' | 'language';
  adminOnly?: boolean;
  authRequired?: boolean;
}

// ─── Top Navigation (Desktop center nav + Mobile bottom nav) ────

export const topNavItems: NavItem[] = [
  { id: 'home', labelKey: 'home', route: '/', iconName: 'Home' },
  { id: 'friends', labelKey: 'friends', route: '/friends', iconName: 'Users' },
  { id: 'reels', labelKey: 'reels', route: '/reels', iconName: 'Film' },
  { id: 'chat', labelKey: 'chat', route: '/chat', iconName: 'MessageCircle' },
  { id: 'wallet', labelKey: 'wallet', route: '/wallet', iconName: 'Wallet' },
];

// ─── FUN Ecosystem Shortcuts ────────────────────────────────────

export const ecosystemItems: EcosystemItem[] = [
  {
    id: 'law-of-light',
    name: 'Law of Light',
    avatar: '/fun-profile-logo-40.webp',
    path: '/law-of-light?view=true',
    isExternal: false,
    isSpecial: true,
  },
  {
    id: 'angel-ai',
    name: 'Angel AI',
    avatar: '/angel-ai-logo-36.png',
    path: 'https://angel.fun.rich',
    isExternal: true,
    feature: 'angel_ai',
  },
  {
    id: 'about',
    name: 'About FUN Profile',
    avatar: '/fun-profile-logo-40.webp',
    path: '/about',
    isExternal: false,
  },
  {
    id: 'fun-play',
    name: 'FUN Play',
    avatar: '/fun-play-logo-36.webp',
    path: 'https://play.fun.rich',
    isExternal: true,
    feature: 'fun_play',
  },
  {
    id: 'fun-farm',
    name: 'FUN Farm',
    avatar: '/fun-farm-logo-36.webp',
    path: 'https://farm.fun.rich',
    isExternal: true,
    feature: 'fun_farm',
  },
  {
    id: 'fun-planet',
    name: 'FUN Planet',
    avatar: '/fun-planet-logo-36.webp',
    path: 'https://planet.fun.rich',
    isExternal: true,
    feature: 'fun_planet',
  },
  {
    id: 'fun-wallet',
    name: 'FUN Wallet',
    avatar: '/fun-wallet-logo-36.webp',
    path: 'https://wallet.fun.rich',
    isExternal: true,
    feature: 'fun_wallet',
  },
  {
    id: 'fun-charity',
    name: 'FUN Charity',
    avatar: '/fun-charity-logo-36.webp',
    path: 'https://charity.fun.rich',
    isExternal: true,
    feature: 'fun_charity',
  },
  {
    id: 'fun-academy',
    name: 'FUN Academy',
    avatar: '/fun-academy-logo-36.webp',
    path: 'https://academy.fun.rich',
    isExternal: true,
    feature: 'fun_academy',
  },
  {
    id: 'green-earth',
    name: 'Green Earth',
    avatar: '/green-earth-logo-36.webp',
    path: 'https://greenearth-fun.lovable.app',
    isExternal: true,
    feature: 'green_earth',
  },
  {
    id: 'lovehub',
    name: 'LoveHUB.Fun',
    avatar: '/lovehub-logo-36.png',
    path: 'https://lovehub.fun/',
    isExternal: true,
    feature: 'lovehub',
  },
  {
    id: 'urantia',
    name: 'Sách Urantia',
    avatar: '/urantia-logo-36.png',
    path: 'https://urantia.fun.rich/',
    isExternal: true,
    feature: 'urantia',
  },
];


// ─── Your Shortcuts ─────────────────────────────────────────────

export const shortcutItems: ShortcutItem[] = [
  { id: 'benefactors', labelKey: 'benefactors', route: '/benefactors', iconName: 'Crown', color: 'text-gold' },
  { id: 'donations', labelKey: 'donationHistory', route: '/donations', iconName: 'Globe', color: 'text-emerald-500' },
  { id: 'users', labelKey: 'memberList', route: '/users', iconName: 'UsersRound', color: 'text-red-500' },
  { id: 'groups', labelKey: 'groups', route: '/groups', iconName: 'UsersRound', color: 'text-blue-500' },
  { id: 'pages', labelKey: 'pages', route: '/pages', iconName: 'Flag', color: 'text-orange-500' },
  { id: 'connected-apps', labelKey: 'connectedApps', route: '/profile/connected-apps', iconName: 'Link2', color: 'text-purple-500' },
  { id: 'sso-docs', labelKey: 'ssoDocs', route: '/docs/ecosystem', iconName: 'BookOpen', color: 'text-green-500' },
];

// ─── Language Options (13 languages) ────────────────────────────

export const languageOptions: LanguageOption[] = [
  { code: 'vi', name: 'VI', fullName: 'Tiếng Việt', flagUrl: 'https://flagcdn.com/w40/vn.png' },
  { code: 'en', name: 'EN', fullName: 'English', flagUrl: 'https://flagcdn.com/w40/us.png' },
  { code: 'zh', name: 'ZH', fullName: '中文', flagUrl: 'https://flagcdn.com/w40/cn.png' },
  { code: 'ja', name: 'JA', fullName: '日本語', flagUrl: 'https://flagcdn.com/w40/jp.png' },
  { code: 'ko', name: 'KO', fullName: '한국어', flagUrl: 'https://flagcdn.com/w40/kr.png' },
  { code: 'th', name: 'TH', fullName: 'ไทย', flagUrl: 'https://flagcdn.com/w40/th.png' },
  { code: 'id', name: 'ID', fullName: 'Indonesia', flagUrl: 'https://flagcdn.com/w40/id.png' },
  { code: 'fr', name: 'FR', fullName: 'Français', flagUrl: 'https://flagcdn.com/w40/fr.png' },
  { code: 'es', name: 'ES', fullName: 'Español', flagUrl: 'https://flagcdn.com/w40/es.png' },
  { code: 'de', name: 'DE', fullName: 'Deutsch', flagUrl: 'https://flagcdn.com/w40/de.png' },
  { code: 'pt', name: 'PT', fullName: 'Português', flagUrl: 'https://flagcdn.com/w40/br.png' },
  { code: 'ru', name: 'RU', fullName: 'Русский', flagUrl: 'https://flagcdn.com/w40/ru.png' },
  { code: 'ar', name: 'AR', fullName: 'العربية', flagUrl: 'https://flagcdn.com/w40/sa.png' },
];

// ─── User Menu Items ────────────────────────────────────────────

export const userMenuItems: UserMenuItem[] = [
  { id: 'language', labelKey: 'language', iconName: 'Globe', action: 'language' },
  { id: 'settings', labelKey: 'settings', iconName: 'Settings', route: '/settings' },
  { id: 'admin', labelKey: 'adminDashboard', iconName: 'Shield', route: '/admin', adminOnly: true },
  { id: 'founder', labelKey: 'founderDashboard', iconName: 'Crown', route: '/founder', adminOnly: true },
  { id: 'logout', labelKey: 'signOut', iconName: 'LogOut', action: 'logout', authRequired: true },
];

// ─── Mobile Bottom Nav Items ────────────────────────────────────

export const mobileBottomNavItems: NavItem[] = [
  { id: 'home', labelKey: 'homeFeed', route: '/', iconName: 'Home' },
  { id: 'reels', labelKey: 'reels', route: '/reels', iconName: 'Film' },
  { id: 'honor-board', labelKey: 'honorBoard', route: '', iconName: 'Award' }, // special: opens drawer
  { id: 'chat', labelKey: 'chat', route: '/chat', iconName: 'MessageCircle' },
  { id: 'gift', labelKey: 'gift', route: '', iconName: 'Gift' }, // special: opens dialog
];
