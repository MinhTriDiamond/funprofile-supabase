import { describe, expect, it } from 'vitest';
import {
  getLiveMaxDurationMinutes,
  getLiveWarningLevel,
  getLiveWarningMilestone,
} from './liveDurationPolicy';

describe('live duration policy', () => {
  it('uses 120 minutes for webcam and 240 minutes for RTMP', () => {
    expect(getLiveMaxDurationMinutes('agora_webcam')).toBe(120);
    expect(getLiveMaxDurationMinutes('rtmp_obs')).toBe(240);
  });

  it('emits configured warning milestones only once', () => {
    const warned = new Set<number>();
    expect(getLiveWarningMilestone(30 * 60, warned)).toBe(30);
    warned.add(30);
    expect(getLiveWarningMilestone(30 * 60, warned)).toBeNull();
    expect(getLiveWarningMilestone(10 * 60, warned)).toBe(10);
    expect(getLiveWarningMilestone(5 * 60, warned)).toBe(5);
    expect(getLiveWarningMilestone(60, warned)).toBe(1);
  });

  it('switches timer tone below 10 minutes', () => {
    expect(getLiveWarningLevel(11 * 60)).toBe('normal');
    expect(getLiveWarningLevel(10 * 60)).toBe('warning');
    expect(getLiveWarningLevel(5 * 60)).toBe('urgent');
    expect(getLiveWarningLevel(0)).toBe('ended');
  });
});
