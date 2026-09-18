# Browser Recorder Legacy

Browser MediaRecorder fallback lives behind feature flags and is not part of the primary webcam live path.

Primary production path:

Agora RTC -> Agora Cloud Recording -> R2 archive -> feed replay.

Do not import recorder internals directly from `../../recording` in new webcam code. Import through this legacy boundary only when the feature flag explicitly enables browser fallback.
