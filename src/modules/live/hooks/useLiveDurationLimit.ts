import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatLiveDuration,
  getLiveMaxDurationSeconds,
  getLiveWarningLevel,
  getLiveWarningMilestone,
  type LiveDurationMode,
} from '../liveDurationPolicy';

export interface LiveDurationLimitState {
  elapsedSeconds: number;
  maxSeconds: number;
  remainingSeconds: number | null;
  elapsedLabel: string;
  maxLabel: string;
  combinedLabel: string;
  warningLevel: 'normal' | 'warning' | 'urgent' | 'ended';
  latestWarningMinute: number | null;
}

export function useLiveDurationLimit(
  startedAt: string | undefined | null,
  mode: LiveDurationMode | string | undefined | null,
  enabled: boolean,
): LiveDurationLimitState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const warnedRef = useRef<Set<number>>(new Set());
  const [latestWarningMinute, setLatestWarningMinute] = useState<number | null>(null);

  useEffect(() => {
    warnedRef.current = new Set();
    setLatestWarningMinute(null);
  }, [startedAt, mode]);

  useEffect(() => {
    if (!enabled || !startedAt) {
      setNowMs(Date.now());
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    setNowMs(Date.now());
    return () => window.clearInterval(id);
  }, [enabled, startedAt]);

  const state = useMemo(() => {
    const maxSeconds = getLiveMaxDurationSeconds(mode);
    const startedMs = startedAt ? Date.parse(startedAt) : NaN;
    const elapsedSeconds = Number.isFinite(startedMs)
      ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
      : 0;
    const remainingSeconds = Number.isFinite(startedMs)
      ? Math.max(0, maxSeconds - elapsedSeconds)
      : null;
    const elapsedLabel = formatLiveDuration(elapsedSeconds);
    const maxLabel = formatLiveDuration(maxSeconds);

    return {
      elapsedSeconds,
      maxSeconds,
      remainingSeconds,
      elapsedLabel,
      maxLabel,
      combinedLabel: `Đã live: ${elapsedLabel} / ${maxLabel}`,
      warningLevel: getLiveWarningLevel(remainingSeconds),
    };
  }, [mode, nowMs, startedAt]);

  useEffect(() => {
    if (!enabled) return;
    const milestone = getLiveWarningMilestone(state.remainingSeconds, warnedRef.current);
    if (milestone == null) return;
    warnedRef.current.add(milestone);
    setLatestWarningMinute(milestone);
  }, [enabled, state.remainingSeconds]);

  return { ...state, latestWarningMinute };
}
