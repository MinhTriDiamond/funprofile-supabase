/**
 * Fun Profile SSO SDK - Custom Error Classes
 */

export class FunProfileError extends Error {
  public code: string;
  public details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FunProfileError';
    this.code = code;
    this.details = details;
  }
}

export class TokenExpiredError extends FunProfileError {
  constructor() {
    super('token_expired', 'Access token has expired');
  }
}

export class InvalidTokenError extends FunProfileError {
  constructor(message = 'Invalid or revoked token') {
    super('invalid_token', message);
  }
}

export class RateLimitError extends FunProfileError {
  public retryAfter: number;

  constructor(retryAfter: number) {
    super('rate_limit_exceeded', `Rate limit exceeded. Retry after ${retryAfter}s`);
    this.retryAfter = retryAfter;
  }
}

export class ValidationError extends FunProfileError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('validation_failed', message, details);
  }
}

export class NetworkError extends FunProfileError {
  constructor(message = 'Network request failed') {
    super('network_error', message);
  }
}
