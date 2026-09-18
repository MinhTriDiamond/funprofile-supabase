# Webcam Live Module

This folder is the home for the Agora webcam live flow.

Current boundary:

- `services/` exposes webcam-specific API calls.
- Existing pages still live in `../pages` during the stability-first refactor.
- Browser recorder fallback remains outside the main webcam path and must stay behind feature flags.

Refactor rule: new webcam code should import from this module instead of adding more direct imports from `../liveService`.
