/**
 * Fun Ecosystem Constants
 * Dùng cho Fun Profile app (SSO Provider)
 * 
 * Lưu ý: Đây KHÔNG phải SDK - SDK chính thức nằm ở sdk-package/
 * và được publish lên npm: @fun-ecosystem/sso-sdk
 */

// Fun Ecosystem Domains
export const DOMAINS = {
  funProfile: 'https://fun.rich',
  funFarm: 'https://farm.fun.rich',
  funPlay: 'https://play.fun.rich',
  funPlanet: 'https://planet.fun.rich',
} as const;

// API Base URL for SSO endpoints
export const API_BASE_URL = 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1';

// OAuth Client IDs
export const CLIENT_IDS = {
  funFarm: 'fun_farm_client',
  funPlay: 'fun_play_client',
  funPlanet: 'fun_planet_client',
} as const;
