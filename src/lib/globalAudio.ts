// Singleton audio manager — survives React component unmount/remount
export interface MusicTrack {
  id: string;
  name: string;
  url: string;
}

export const TRACKS: MusicTrack[] = [
  { id: 'light-economy-anthem', name: 'Light Economy Anthem', url: '/sounds/light-economy-anthem.mp3' },
  { id: 'velvet-light', name: 'Velvet Light', url: '/sounds/velvet-light.mp3' },
];

const DEFAULT_TRACK_ID = TRACKS[0].id;
const TRACK_STORAGE_KEY = 'ga_current_track';

function loadInitialTrackId(): string {
  try {
    const saved = localStorage.getItem(TRACK_STORAGE_KEY);
    if (saved && TRACKS.some(t => t.id === saved)) return saved;
  } catch {}
  return DEFAULT_TRACK_ID;
}

function getTrackById(id: string): MusicTrack {
  return TRACKS.find(t => t.id === id) ?? TRACKS[0];
}

// Prevent duplicate instances/listeners from HMR
const WIN = window as unknown as {
  __ga_audio?: HTMLAudioElement;
  __ga_autoplay?: boolean;
  __ga_attempting?: Promise<void> | null;
  __ga_cleanup?: (() => void) | null;
};

let _volume = 0.3;
let _playing = false;
let _currentTrackId: string = loadInitialTrackId();
let _currentTime = 0;
let _duration = 0;

type ManagedAudio = HTMLAudioElement & {
  __ga_bound?: boolean;
};

function attachListeners(audio: ManagedAudio) {
  if (audio.__ga_bound) return;

  audio.addEventListener('pause', () => { _playing = false; notify(); });
  audio.addEventListener('play', () => { _playing = true; notify(); });
  audio.addEventListener('volumechange', () => { syncStateFromAudio(); notify(); });
  audio.addEventListener('timeupdate', () => { _currentTime = audio.currentTime || 0; notify(); });
  audio.addEventListener('loadedmetadata', () => {
    _duration = isFinite(audio.duration) ? audio.duration : 0;
    _currentTime = audio.currentTime || 0;
    notify();
  });
  audio.addEventListener('durationchange', () => {
    _duration = isFinite(audio.duration) ? audio.duration : 0;
    notify();
  });
  audio.addEventListener('seeked', () => { _currentTime = audio.currentTime || 0; notify(); });
  audio.addEventListener('ended', () => {
    _currentTime = 0;
    // Auto-advance to next track in playlist (loop around)
    const idx = TRACKS.findIndex(t => t.id === _currentTrackId);
    const next = TRACKS[(idx + 1) % TRACKS.length];
    _currentTrackId = next.id;
    _duration = 0;
    try { localStorage.setItem(TRACK_STORAGE_KEY, next.id); } catch {}
    audio.src = next.url;
    audio.load();
    audio.play().catch(() => { _playing = false; notify(); });
    notify();
  });
  audio.addEventListener('error', () => {
    _playing = false;
    if (WIN.__ga_audio === audio) WIN.__ga_audio = undefined;
    notify();
  });

  audio.__ga_bound = true;
}

function syncStateFromAudio() {
  const a = WIN.__ga_audio;
  if (!a) return;
  _volume = a.volume;
  _playing = !a.paused && !a.ended;
  _currentTime = a.currentTime || 0;
  if (isFinite(a.duration)) _duration = a.duration;
}

function getAudio(): HTMLAudioElement {
  if (!WIN.__ga_audio) {
    const a = new Audio(getTrackById(_currentTrackId).url) as ManagedAudio;
    a.loop = false;
    a.preload = 'auto';
    a.volume = _volume;
    attachListeners(a);
    WIN.__ga_audio = a;
  }
  return WIN.__ga_audio;
}

export function registerAudioElement(audio: HTMLAudioElement | null) {
  if (!audio) return;

  const managedAudio = audio as ManagedAudio;
  const expectedSrc = `${window.location.origin}${getTrackById(_currentTrackId).url}`;

  if (managedAudio.src !== expectedSrc) {
    managedAudio.src = getTrackById(_currentTrackId).url;
  }

  managedAudio.loop = false;
  managedAudio.preload = 'auto';
  managedAudio.volume = _volume;
  attachListeners(managedAudio);

  if (WIN.__ga_audio && WIN.__ga_audio !== managedAudio) {
    WIN.__ga_audio.pause();
  }

  WIN.__ga_audio = managedAudio;
  syncStateFromAudio();
  notify();
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getState() {
  syncStateFromAudio();
  return {
    playing: _playing,
    volume: _volume,
    currentTrackId: _currentTrackId,
    tracks: TRACKS,
    currentTime: _currentTime,
    duration: _duration,
  };
}

export function seek(seconds: number) {
  const a = WIN.__ga_audio;
  if (!a) return;
  if (!isFinite(a.duration) || a.duration <= 0) return;
  const clamped = Math.max(0, Math.min(seconds, a.duration));
  try {
    a.currentTime = clamped;
    _currentTime = clamped;
    notify();
  } catch {}
}

function attemptAutoplay() {
  const a = getAudio();
  syncStateFromAudio();

  if (!a.paused) {
    notify();
    return Promise.resolve();
  }

  if (WIN.__ga_attempting) return WIN.__ga_attempting;

  WIN.__ga_attempting = a.play()
    .then(() => {
      syncStateFromAudio();
      notify();
    })
    .catch(() => {
      syncStateFromAudio();
      notify();
      throw new Error('AUTOPLAY_BLOCKED');
    })
    .finally(() => {
      WIN.__ga_attempting = null;
    });

  return WIN.__ga_attempting;
}

export function play() {
  attemptAutoplay().catch(() => {
    _playing = false;
    notify();
  });
}

export function ensureAutoplay() {
  attemptAutoplay().catch(() => {
    _playing = false;
    notify();
  });
}

export function pause() {
  WIN.__ga_audio?.pause();
}

export function toggle() {
  const a = WIN.__ga_audio;
  if (a && !a.paused) {
    pause();
  } else {
    play();
  }
}

export function setVolume(v: number) {
  _volume = v;
  if (WIN.__ga_audio) WIN.__ga_audio.volume = v;
  notify();
}

export function setTrack(trackId: string) {
  const track = TRACKS.find(t => t.id === trackId);
  if (!track) return;
  if (_currentTrackId === trackId && WIN.__ga_audio?.src.endsWith(track.url)) return;

  _currentTrackId = trackId;
  _currentTime = 0;
  _duration = 0;
  try { localStorage.setItem(TRACK_STORAGE_KEY, trackId); } catch {}

  const a = getAudio();
  const wasPlaying = !a.paused;
  a.pause();
  a.src = track.url;
  a.load();

  if (wasPlaying) {
    // Resume on the new track
    a.play().catch(() => {
      _playing = false;
      notify();
    });
  } else {
    notify();
  }
}

// Auto-play on first user interaction (only register once globally)
if (!WIN.__ga_autoplay) {
  WIN.__ga_autoplay = true;
  const pointerEvents = ['click', 'touchstart', 'keydown', 'pointerdown'] as const;

  const interactionHandler = () => {
    attemptAutoplay()
      .then(() => {
        WIN.__ga_cleanup?.();
        WIN.__ga_cleanup = null;
      })
      .catch(() => {
        // Browser blocked — keep listeners and retry on next signal
      });
  };

  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      interactionHandler();
    }
  };

  pointerEvents.forEach(e => document.addEventListener(e, interactionHandler, { capture: true }));
  window.addEventListener('focus', interactionHandler);
  window.addEventListener('pageshow', interactionHandler);
  document.addEventListener('visibilitychange', visibilityHandler);

  WIN.__ga_cleanup = () => {
    pointerEvents.forEach(e => document.removeEventListener(e, interactionHandler, true));
    window.removeEventListener('focus', interactionHandler);
    window.removeEventListener('pageshow', interactionHandler);
    document.removeEventListener('visibilitychange', visibilityHandler);
  };

  // Best-effort attempt immediately on page load; some browsers allow it.
  interactionHandler();
}
