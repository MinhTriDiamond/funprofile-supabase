import { useLightScore } from '@/hooks/useLightScore';
import { DIMENSION_LEVELS } from '@/config/pplp';

export interface DimensionScores {
  identity: number;
  activity: number;
  onchain: number;
  transparency: number;
  ecosystem: number;
}

type LevelInfo = { name: string; minScore: number; emoji: string };

export interface DimensionData {
  dimensions: DimensionScores | null;
  dimensionTotal: number | null;
  dimensionLevel: string | null;
  riskPenalty: number;
  streakBonusPct: number;
  inactiveDays: number;
  decayApplied: boolean;
  isLoading: boolean;
  getLevelInfo: () => LevelInfo;
  getNextLevelProgress: () => { progress: number; nextLevel: LevelInfo; remaining: number };
}

const LEVELS_ARRAY: LevelInfo[] = Object.values(DIMENSION_LEVELS);

export const useDimensionScores = (): DimensionData => {
  const { data, isLoading } = useLightScore();

  const dimensions = data?.dimensions ?? null;
  const dimensionTotal = data?.dimension_total ?? null;
  const dimensionLevel = data?.dimension_level ?? null;
  const riskPenalty = data?.risk_penalty ?? 0;
  const streakBonusPct = data?.streak_bonus_pct ?? 0;
  const inactiveDays = data?.inactive_days ?? 0;
  const decayApplied = data?.decay_applied ?? false;

  const getLevelInfo = (): LevelInfo => {
    if (!dimensionTotal) return LEVELS_ARRAY[0];
    if (dimensionTotal >= 800) return LEVELS_ARRAY[4];
    if (dimensionTotal >= 500) return LEVELS_ARRAY[3];
    if (dimensionTotal >= 250) return LEVELS_ARRAY[2];
    if (dimensionTotal >= 100) return LEVELS_ARRAY[1];
    return LEVELS_ARRAY[0];
  };

  const getNextLevelProgress = () => {
    const score = dimensionTotal ?? 0;
    
    let currentIdx = 0;
    for (let i = LEVELS_ARRAY.length - 1; i >= 0; i--) {
      if (score >= LEVELS_ARRAY[i].minScore) { currentIdx = i; break; }
    }
    
    if (currentIdx >= LEVELS_ARRAY.length - 1) {
      return { progress: 100, nextLevel: LEVELS_ARRAY[LEVELS_ARRAY.length - 1], remaining: 0 };
    }
    
    const current = LEVELS_ARRAY[currentIdx];
    const next = LEVELS_ARRAY[currentIdx + 1];
    const range = next.minScore - current.minScore;
    const progress = range > 0 ? ((score - current.minScore) / range) * 100 : 0;
    
    return {
      progress: Math.min(100, Math.max(0, progress)),
      nextLevel: next,
      remaining: Math.max(0, next.minScore - score),
    };
  };

  return {
    dimensions,
    dimensionTotal,
    dimensionLevel,
    riskPenalty,
    streakBonusPct,
    inactiveDays,
    decayApplied,
    isLoading,
    getLevelInfo,
    getNextLevelProgress,
  };
};
