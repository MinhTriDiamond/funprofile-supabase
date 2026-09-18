/**
 * Fun Profile SSO SDK - Constants
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

// Default SSO API base URL (Fun Profile)
export const DEFAULT_BASE_URL = API_BASE_URL;

export const ENDPOINTS = {
  authorize: '/sso-authorize',
  token: '/sso-token',
  verify: '/sso-verify',
  refresh: '/sso-refresh',
  revoke: '/sso-revoke',
  register: '/sso-register',
  syncData: '/sso-sync-data',
  syncFinancial: '/sso-sync-financial',
  web3Auth: '/sso-web3-auth',
  otpRequest: '/sso-otp-request',
  otpVerify: '/sso-otp-verify',
} as const;

export const DEFAULT_SCOPES = ['profile'];

// Refresh tokens 5 minutes before they expire
export const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

// SDK version
export const SDK_VERSION = '1.1.0';

// Default timeout for requests (30 seconds)
export const DEFAULT_TIMEOUT = 30000;
