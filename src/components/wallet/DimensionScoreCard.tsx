import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useDimensionScores } from '@/hooks/useDimensionScores';
import { DIMENSIONS } from '@/config/pplp';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';

const DIMENSION_COLORS: Record<string, string> = {
  identity: 'from-blue-400 to-blue-600',
  activity: 'from-amber-400 to-amber-600',
  onchain: 'from-purple-400 to-purple-600',
  transparency: 'from-green-400 to-green-600',
  ecosystem: 'from-rose-400 to-rose-600',
};

export const DimensionScoreCard = memo(() => {
  const {
    dimensions, dimensionTotal, dimensionLevel,
    riskPenalty, streakBonusPct, inactiveDays, decayApplied,
    isLoading, getLevelInfo, getNextLevelProgress,
  } = useDimensionScores();

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!dimensions) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20">
        <CardContent className="py-6 text-center">
          <p className="text-lg font-semibold mb-1">🌱 5 Trụ Cột Danh Tiếng</p>
          <p className="text-sm text-muted-foreground">
            Dữ liệu đang được tính toán. Vui lòng quay lại sau.
          </p>
        </CardContent>
      </Card>
    );
  }

  const levelInfo = getLevelInfo();
  const { progress, nextLevel, remaining } = getNextLevelProgress();

  // Radar chart data
  const radarData = Object.entries(DIMENSIONS).map(([key, dim]) => ({
    dimension: dim.emoji + ' ' + dim.nameVi,
    value: dimensions[key as keyof typeof dimensions] || 0,
    fullMark: 100,
  }));

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">🌟</span>
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              5 TRỤ CỘT DANH TIẾNG
            </span>
          </CardTitle>
          <Badge variant="secondary" className="text-sm">
            {levelInfo.emoji} {levelInfo.name}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Total Score */}
        <div className="text-center py-2">
          <p className="text-5xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            {dimensionTotal?.toLocaleString() ?? 0}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {dimensionTotal !== null && dimensionTotal < 800
              ? `Còn ${remaining.toLocaleString()} điểm để đạt ${nextLevel.emoji} ${nextLevel.name}`
              : `${levelInfo.emoji} ${levelInfo.name} — Cấp cao nhất!`}
          </p>
        </div>

        {/* Level progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{levelInfo.emoji} {levelInfo.name}</span>
            <span>{nextLevel.emoji} {nextLevel.name}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Radar Chart */}
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Score"
                dataKey="value"
                stroke="hsl(250, 70%, 55%)"
                fill="hsl(250, 70%, 55%)"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 5 Dimension bars */}
        <div className="grid gap-2">
          {Object.entries(DIMENSIONS).map(([key, dim]) => {
            const value = dimensions[key as keyof typeof dimensions] || 0;
            const gradient = DIMENSION_COLORS[key] || 'from-gray-400 to-gray-600';
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-base w-6 text-center">{dim.emoji}</span>
                <span className="flex-1 text-xs font-medium">{dim.nameVi}</span>
                <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                    style={{ width: `${Math.min(100, value)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{Math.round(value)}</span>
              </div>
            );
          })}
        </div>

        {/* Status indicators */}
        <div className="flex flex-wrap gap-2 justify-center">
          {streakBonusPct > 0 && (
            <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:text-green-300">
              🔥 Streak +{streakBonusPct}%
            </Badge>
          )}
          {riskPenalty > 0 && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-300">
              ⚠️ Penalty -{riskPenalty}
            </Badge>
          )}
          {decayApplied && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-300">
              ⏳ Decay ({inactiveDays}d)
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

DimensionScoreCard.displayName = 'DimensionScoreCard';
