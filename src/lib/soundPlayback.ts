// Unified short-sound player. Caps duration with a fade-out so SFX never linger.

export interface CappedSoundOptions {
  maxMs?: number;     // Hard cap including fade. Default 5000.
  fadeMs?: number;    // Fade-out tail. Default 300.
  volume?: number;    // 0..1. Defaults to user-set sound_volume (or 0.6).
  loop?: boolean;     // If true, ignores maxMs.
}

export interface CappedSoundHandle {
  audio: HTMLAudioElement;
  stop: () => void;
}

const VOLUME_KEY = 'sound_volume';

export function getUserVolume(fallback = 0.6): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1, v));
  } catch {
    return fallback;
  }
}

export function setUserVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  } catch { /* ignore */ }
}

export function playCappedSound(src: string, opts: CappedSoundOptions = {}): CappedSoundHandle | null {
  try {
    const { maxMs = 5000, fadeMs = 300, loop = false } = opts;
    const baseVolume = opts.volume ?? getUserVolume();
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = baseVolume;

    let fadeRaf = 0;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (stopTimer) clearTimeout(stopTimer);
      if (fadeRaf) cancelAnimationFrame(fadeRaf);
      try { audio.pause(); } catch { /* ignore */ }
      try { audio.currentTime = 0; } catch { /* ignore */ }
    };

    audio.play().catch(() => { stop(); });

    if (!loop) {
      const fadeStartDelay = Math.max(0, maxMs - fadeMs);
      stopTimer = setTimeout(() => {
        const start = performance.now();
        const fromVol = audio.volume;
        const tick = () => {
          if (stopped) return;
          const elapsed = performance.now() - start;
          const ratio = Math.min(1, elapsed / fadeMs);
          audio.volume = Math.max(0, fromVol * (1 - ratio));
          if (ratio < 1) {
            fadeRaf = requestAnimationFrame(tick);
          } else {
            stop();
          }
        };
        fadeRaf = requestAnimationFrame(tick);
      }, fadeStartDelay);
    }

    audio.addEventListener('ended', stop);

    return { audio, stop };
  } catch {
    return null;
  }
}
