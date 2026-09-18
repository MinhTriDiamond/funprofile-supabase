import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLightScore } from '@/hooks/useLightScore';
import { useFunBalance } from '@/hooks/useFunBalance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Coins, Lock, Zap, RefreshCw, Wallet,
  Loader2, ExternalLink, ArrowRight,
} from 'lucide-react';
import { formatFUN, getAddressUrl, FUN_MONEY_CONTRACT } from '@/config/pplp';
import funLogo from '@/assets/tokens/fun-logo.png';
import { useLanguage } from '@/i18n/LanguageContext';
import { DimensionScoreCard } from './DimensionScoreCard';
import PPLPv2SubmitWizard from './PPLPv2SubmitWizard';
import PPLPv2ExtendedUI from './PPLPv2ExtendedUI';
import { LightScoreV25Card } from './v25/LightScoreV25Card';

// PPLP v2.0 — 5 Trụ cột Ánh Sáng mới
const PILLAR_ICONS = {
  repentance: '🙏',
  gratitude: '💛',
  service: '☀️',
  help: '🤝',
  giving: '🎁',
};

const PILLAR_NAMES = {
  repentance: 'Sám Hối',
  gratitude: 'Biết Ơn',
  service: 'Phụng Sự',
  help: 'Giúp Đỡ',
  giving: 'Trao Tặng',
};

interface LightScoreDashboardProps {
  walletAddress?: `0x${string}`;
  onActivate?: () => void;
  onClaim?: () => void;
}

export const LightScoreDashboard = ({ walletAddress, onActivate, onClaim }: LightScoreDashboardProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, refetch, getTierInfo, getNextTierProgress } = useLightScore();
  const { total, locked, activated, isLoading: isBalanceLoading, refetch: refetchBalance } = useFunBalance(walletAddress);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchBalance()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const activatedPercent = total > 0 ? (activated / total) * 100 : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="border-0 shadow-lg">
          <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground mb-4">Không thể tải Light Score</p>
          <Button onClick={refetch} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const tierInfo = getTierInfo();
  const { progress, nextTier, remaining } = getNextTierProgress();

  return (
    <div className="space-y-4">
      {/* ===== PPLP v2.5 — Light Score Engine (Top) ===== */}
      <LightScoreV25Card />

      {/* ===== PPLP v2: Truth Validation Wizard ===== */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="py-4">
          <PPLPv2SubmitWizard />
        </CardContent>
      </Card>

      {/* ===== PPLP v2: Events / Attendance / Light Profile ===== */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="py-4">
          <PPLPv2ExtendedUI />
        </CardContent>
      </Card>

      {/* ===== CARD 0: 5 DIMENSION SCORES ===== */}
      <DimensionScoreCard />

      {/* ===== CARD 1: UNIFIED LIGHT SCORE ===== */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="w-6 h-6 text-amber-500" />
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                LIGHT SCORE
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {tierInfo.emoji} {tierInfo.name}
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefreshAll} disabled={isRefreshing}>
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Combined Score Display */}
          <div className="text-center py-2">
            <p className="text-5xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              {(data.v2?.combined_light_score ?? data.total_light_score).toLocaleString()}
            </p>
            {data.v2 && data.v2.v2_light_score > 0 && (
              <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">v1 Legacy</Badge>
                  {data.total_light_score.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500">v2 PPLP</Badge>
                  {data.v2.v2_light_score.toLocaleString()}
                </span>
              </div>
            )}
            {data.tier < 3 && (
              <p className="text-sm text-muted-foreground mt-1">
                Còn {remaining.toLocaleString()} điểm để đạt {nextTier.emoji} {nextTier.name}
              </p>
            )}
          </div>

          {/* v2 actions summary */}
          {data.v2 && data.v2.v2_actions_count > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  ✅ PPLP v2 — Truth Validation
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-600">
                  {data.v2.v2_actions_count} actions
                </Badge>
              </div>
              {data.v2.v2_minted_amount > 0 && (
                <p className="text-xs text-emerald-600 mt-1">
                  💎 Đã mint: {data.v2.v2_minted_amount.toLocaleString()} FUN
                </p>
              )}
            </div>
          )}

          {/* Progress to next tier */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tierInfo.emoji} {tierInfo.name}</span>
              <span>{nextTier.emoji} {nextTier.name}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* 5 Pillars */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">5 Pillars of Light</h4>
            <div className="grid gap-1.5">
              {Object.entries(data.pillars).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-base">{PILLAR_ICONS[key as keyof typeof PILLAR_ICONS]}</span>
                  <span className="flex-1 text-xs">{PILLAR_NAMES[key as keyof typeof PILLAR_NAMES]}</span>
                  <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (value / 100) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(value)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* v1 deprecation notice */}
          <div className="bg-amber-100/50 dark:bg-amber-900/20 rounded-lg p-2.5 border border-amber-200 dark:border-amber-800">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              ⚠️ <strong>v1 (Social Engagement)</strong> sẽ dần chuyển sang <strong>v2 (Truth Validation)</strong>. 
              Hãy sử dụng PPLP v2 Submit Action ở trên để tích lũy Light Score bền vững.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== CARD 2: FUN ON-CHAIN BALANCE ===== */}
      {walletAddress ? (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <img src={funLogo} alt="FUN" className="w-5 h-5 rounded-full" />
                💰 Số dư On-chain
              </CardTitle>
              <div className="flex items-center gap-2">
                <a href={getAddressUrl(walletAddress)} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {isBalanceLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              </div>
            ) : (
              <>
                {/* 3 ô số dư */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center border border-amber-100 dark:border-amber-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Locked</span>
                    </div>
                    <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatFUN(locked)}</p>
                    <p className="text-xs text-muted-foreground">FUN</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-3 text-center border border-green-100 dark:border-green-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Zap className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-300">Activated</span>
                    </div>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{formatFUN(activated)}</p>
                    <p className="text-xs text-muted-foreground">FUN</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 rounded-xl p-3 text-center border border-amber-200 dark:border-amber-700">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Coins className="w-3.5 h-3.5 text-amber-700" />
                      <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Total</span>
                    </div>
                    <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{formatFUN(total)}</p>
                    <p className="text-xs text-muted-foreground">FUN</p>
                  </div>
                </div>

                {/* Progress activated */}
                {total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Tiến trình kích hoạt</span>
                      <span className="font-medium text-green-600">{activatedPercent.toFixed(1)}%</span>
                    </div>
                    <Progress value={activatedPercent} className="h-2 bg-amber-100" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>🔒 {formatFUN(locked)} locked</span>
                      <span>⚡ {formatFUN(activated)} activated</span>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {locked > 0 && onActivate && (
                    <Button onClick={onActivate} className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-sm py-2">
                      <Lock className="w-3.5 h-3.5 mr-1.5" />Activate FUN
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                  {activated > 0 && onClaim && (
                    <Button onClick={onClaim} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-sm py-2">
                      <Zap className="w-3.5 h-3.5 mr-1.5" />Claim to Wallet
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                </div>

                {/* Contract badge */}
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">Contract: {FUN_MONEY_CONTRACT.address.slice(0, 8)}...</Badge>
                  <Badge variant="outline" className="text-xs">BSC Testnet</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="py-6 text-center">
            <Coins className="w-10 h-10 mx-auto text-amber-400 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Kết nối ví để xem số dư FUN on-chain</p>
            <Button onClick={() => navigate('/wallet')} variant="outline" size="sm">
              <Wallet className="w-4 h-4 mr-2" />Thiết lập ví
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// MED-6: Wrap with React.memo to prevent re-renders when parent state changes
// but LightScoreDashboard props don't change (walletAddress, onActivate, onClaim are stable)
export const MemoizedLightScoreDashboard = memo(LightScoreDashboard);
