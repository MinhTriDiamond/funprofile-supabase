// Mystery Box sound effects — synthesized via WebAudio, không cần file MP3.
// 3 phase: shake (tick-tick), burst (fanfare), reveal (chime theo tier).

import type { BoxTier } from '@/modules/mystery-box/types';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && ctx.state !== 'closed') return ctx;
  try {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

const isMuted = (): boolean => {
  try { return localStorage.getItem('celebration_muted') === 'true'; } catch { return false; }
};

function tone(freq: number, startOffset: number, durMs: number, gain = 0.18, type: OscillatorType = 'sine') {
  const c = ac(); if (!c || isMuted()) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + durMs / 1000 + 0.05);
}

/** Phase 1: shake — 3 tick gỗ */
export function playShakeSound() {
  tone(420, 0, 80, 0.12, 'square');
  tone(380, 0.25, 80, 0.12, 'square');
  tone(440, 0.55, 90, 0.14, 'square');
}

/** Phase 2: burst — fanfare ngắn */
export function playBurstSound() {
  // Arpeggio C-E-G-C
  tone(523.25, 0,    180, 0.18, 'triangle');
  tone(659.25, 0.08, 180, 0.18, 'triangle');
  tone(783.99, 0.16, 220, 0.20, 'triangle');
  tone(1046.5, 0.26, 320, 0.22, 'triangle');
  // Sparkle layer
  tone(1568, 0.30, 200, 0.10, 'sine');
}

/** Phase 3: reveal — chime theo tier */
export function playRevealSound(tier: BoxTier) {
  const profiles: Record<BoxTier, { freqs: number[]; gain: number; dur: number }> = {
    common:    { freqs: [659.25, 987.77],                 gain: 0.16, dur: 400 },
    rare:      { freqs: [659.25, 987.77, 1318.5],         gain: 0.18, dur: 500 },
    epic:      { freqs: [523.25, 783.99, 1046.5, 1318.5], gain: 0.20, dur: 650 },
    legendary: { freqs: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], gain: 0.22, dur: 800 },
    cosmic:    { freqs: [392, 523.25, 659.25, 783.99, 987.77, 1318.5, 1760, 2093], gain: 0.24, dur: 1000 },
  };
  const p = profiles[tier];
  p.freqs.forEach((f, i) => tone(f, i * 0.06, p.dur, p.gain, 'sine'));
}
