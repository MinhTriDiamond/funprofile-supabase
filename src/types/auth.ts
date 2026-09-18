/**
 * Authentication Types
 * Shared type definitions for authentication flows
 */

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  wallet_address?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export interface OtpLoginResult {
  success: boolean;
  user_id?: string;
  is_new_user?: boolean;
  magic_link?: string;
  error?: string;
  attempts_remaining?: number;
}

export interface Web3AuthResult {
  success: boolean;
  user_id?: string;
  is_new_user?: boolean;
  magic_link?: string;
  error?: string;
}

export interface AuthFormState {
  loading: boolean;
  error: string | null;
}

export type AuthMethod = 'email' | 'wallet' | 'google';

export type AuthStep = 'email' | 'otp' | 'connect' | 'sign' | 'verify';
