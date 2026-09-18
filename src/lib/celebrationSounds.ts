// Celebration sounds — dedicated player for the celebration MP3s.
// Single source of truth: DonationReceivedCard controls play/stop.
// Plays the FULL clip (no artificial cap) and fades out on stop.
import { getUserVolume } from './soundPlayback';

let currentAudio: HTMLAudioElement | null = null;
let fadeRaf = 0;

const isCelebrationMuted = (): boolean => {
  try {
    return localStorage.getItem('celebration_muted') === 'true';
  } catch {
    return false;
  }
};

/** Stop the currently-playing celebration audio with a smooth fade. */
export const stopCelebrationMusic = (fadeMs: number = 500) => {
  const audio = currentAudio;
  currentAudio = null;
  if (!audio) return;
  if (fadeRaf) cancelAnimationFrame(fadeRaf);

  const hardStop = () => {
    try { audio.pause(); } catch { /* ignore */ }
    try { audio.currentTime = 0; } catch { /* ignore */ }
  };

  if (fadeMs <= 0) {
    hardStop();
    return;
  }

  const start = performance.now();
  const fromVol = audio.volume;
  const tick = () => {
    const elapsed = performance.now() - start;
    const ratio = Math.min(1, elapsed / fadeMs);
    audio.volume = Math.max(0, fromVol * (1 - ratio));
    if (ratio < 1) {
      fadeRaf = requestAnimationFrame(tick);
    } else {
      hardStop();
    }
  };
  fadeRaf = requestAnimationFrame(tick);
};

const startPlayback = (soundId: string, loop: boolean): HTMLAudioElement | null => {
  if (isCelebrationMuted()) return null;
  // Hard-stop previous so we never overlap.
  stopCelebrationMusic(0);

  try {
    const audio = new Audio(`/sounds/${soundId}.mp3`);
    audio.loop = loop;
    audio.volume = Math.max(getUserVolume(0.6), 0.1);
    audio.addEventListener('ended', () => {
      if (currentAudio === audio) currentAudio = null;
    });
    audio.play().catch(() => {
      if (currentAudio === audio) currentAudio = null;
    });
    currentAudio = audio;
    return audio;
  } catch {
    return null;
  }
};

/** Play a one-shot celebration clip through its natural end (rich-1 by default). */
export const playCelebrationMusic = (soundId: string = 'rich-1'): HTMLAudioElement | null => {
  return startPlayback(soundId, false);
};

/** Play celebration music in a continuous loop. */
export const playCelebrationMusicLoop = (soundId: string = 'rich-3'): HTMLAudioElement | null => {
  return startPlayback(soundId, true);
};

/** Legacy compatibility - plays the default celebration MP3 */
export const playCelebrationSounds = () => {
  playCelebrationMusic('rich-1');
};

/** Play notification sound for recipient (looped rich-3) */
export const playReceivedNotificationSound = (): HTMLAudioElement | null => {
  return playCelebrationMusicLoop('rich-3');
};
