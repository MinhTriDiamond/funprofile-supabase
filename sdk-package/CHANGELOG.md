# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-13

### Added

- **OTP Authentication**: 
  - `requestOtp()` - Request OTP code via email/phone
  - `verifyOtp()` - Verify OTP and get auth tokens
- **Web3 Authentication**:
  - `generateWeb3Message()` - Generate SIWE-style message for signing
  - `authenticateWeb3()` - Authenticate with wallet signature
- New TypeScript types: `OtpRequestOptions`, `OtpRequestResult`, `OtpVerifyOptions`, `Web3AuthOptions`, `Web3AuthResult`, `Web3SignMessageOptions`

### Changed

- Updated SDK_VERSION to 1.1.0

---

## [1.0.2] - 2026-01-12

### Fixed

- Added `"type": "module"` to package.json for ES module compatibility
- Fixed tsconfig.json to include `declaration: true` option

### Changed

- Updated SDK_VERSION to match npm package version

---

## [1.0.1] - 2026-01-12

### Fixed

- Fixed test script with `--passWithNoTests` flag for CI compatibility
- Added missing `tslib` dependency for Rollup TypeScript compilation

### Changed

- Updated documentation with correct OAuth client IDs:
  - `fun_farm_client` (was `fun_farm_production`)
  - `fun_play_client` (was `fun_play_production`)
  - `fun_planet_client` (was `fun_planet_production`)

---

## [1.0.0] - 2025-01-07

### Added

- 🎉 Initial release of @fun-ecosystem/sso-sdk
- OAuth 2.0 + PKCE authentication flow
- Multiple storage adapters:
  - `LocalStorageAdapter` - Persistent storage
  - `SessionStorageAdapter` - Session-based (recommended for wallet scopes)
  - `MemoryStorageAdapter` - In-memory for testing
- `DebouncedSyncManager` for efficient data synchronization
- Full TypeScript support with type definitions
- Error classes for better error handling:
  - `FunProfileError`
  - `TokenExpiredError`
  - `InvalidTokenError`
  - `RateLimitError`
  - `ValidationError`
  - `NetworkError`
- Platform constants for Fun Farm, Fun Play, Fun Planet
- React and Next.js integration examples

### Security

- PKCE (Proof Key for Code Exchange) implementation
- Secure token storage recommendations
- XSS protection with SessionStorageAdapter for sensitive scopes

---

## [Unreleased]

### Planned

- React hooks package (`@fun-ecosystem/sso-sdk-react`)
- Vue.js integration
- Offline support with sync queue
- Biometric authentication support
