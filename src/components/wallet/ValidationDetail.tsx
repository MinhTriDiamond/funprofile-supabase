import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, Shield, Activity, Users } from 'lucide-react';

// PPLP v2.0 — 5 Trụ cột Ánh Sáng mới
const PILLAR_INFO = [
  { key: 'repentance', icon: '🙏', name: 'Sám Hối', desc: 'Dấu hiệu tự nhìn lại, nhận lỗi, chuyển hoá bản thân' },
  { key: 'gratitude', icon: '💛', name: 'Biết Ơn', desc: 'Năng lượng biết ơn, trân trọng cuộc sống và người khác' },
  { key: 'service_pillar', icon: '☀️', name: 'Phụng Sự', desc: 'Phụng sự sự sống, giúp ích cộng đồng' },
  { key: 'help_pillar', icon: '🤝', name: 'Giúp Đỡ', desc: 'Giúp đỡ người khác cụ thể, có phản hồi xác nhận' },
  { key: 'giving_pillar', icon: '🎁', name: 'Trao Tặng', desc: 'Trao tặng thời gian, tiền, kiến thức, tình yêu' },
];

const STATUS_STYLES: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
  validated: { bg: 'bg-green-50 dark:bg-green-950/20', icon: <CheckCircle2 className="w-8 h-8 text-green-500" />, label: 'Xác thực thành công' },
  minted: { bg: 'bg-amber-50 dark:bg-amber-950/20', icon: <Sparkles className="w-8 h-8 text-amber-500" />, label: 'Đã mint FUN Money' },
  rejected: { bg: 'bg-red-50 dark:bg-red-950/20', icon: <XCircle className="w-8 h-8 text-red-500" />, label: 'Từ chối' },
  manual_review: { bg: 'bg-yellow-50 dark:bg-yellow-950/20', icon: <AlertTriangle className="w-8 h-8 text-yellow-500" />, label: 'Đang xem xét thủ công' },
};

interface ValidationDetailProps {
  validation: {
    validation_status: string;
    final_light_score: number;
    raw_light_score: number;
    pplp_scores?: Record<string, number>;
    ai_score?: number;
    community_score?: number;
    trust_signal_score?: number;
    impact_weight?: number;
    trust_multiplier?: number;
    consistency_multiplier?: number;
    flags?: string[];
    explanation?: {
      reasoning?: string;
      validator?: string;
      attendance_multiplier?: number;
      profile_trust_level?: number;
      community_pillars?: Record<string, number>;
    };
    mint?: {
      mint_amount_user: number;
      mint_amount_platform: number;
    } | null;
  };
}

export default function ValidationDetail({ validation }: ValidationDetailProps) {
  const status = STATUS_STYLES[validation.validation_status] || STATUS_STYLES.manual_review;
  const pillars = validation.pplp_scores || {};

  return (
    <div className="space-y-3">
      {/* Status Banner */}
      <Card className={`border-0 ${status.bg}`}>
        <CardContent className="py-4 text-center">
          <div className="flex justify-center mb-2">{status.icon}</div>
          <p className="font-bold text-lg">{status.label}</p>
          <p className="text-3xl font-bold mt-1 bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            {validation.final_light_score.toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground">Final Light Score</p>
        </CardContent>
      </Card>

      {/* 5 Pillars Detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> 5 Trụ cột PPLP
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Công thức: (S × T × H × V × U) / 10⁴ = {validation.raw_light_score.toFixed(4)}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {PILLAR_INFO.map(p => {
            const score = Number(pillars[p.key]) || 0;
            const percent = Math.min(100, score * 10);
            return (
              <div key={p.key}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{p.icon}</span>
                  <span className="text-xs font-medium flex-1">{p.name}</span>
                  <span className="text-sm font-bold font-mono">{score.toFixed(1)}</span>
                </div>
                <Progress value={percent} className="h-2" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" /> Phân tích điểm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">AI Score (60%)</p>
              <p className="font-bold text-sm">{(validation.ai_score || 0).toFixed(1)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">Community (20%)</p>
              <p className="font-bold text-sm">{(validation.community_score || 0).toFixed(1)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">Trust Signal (20%)</p>
              <p className="font-bold text-sm">{(validation.trust_signal_score || 0).toFixed(1)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-muted-foreground">Raw Light Score</p>
              <p className="font-bold text-sm">{validation.raw_light_score.toFixed(4)}</p>
            </div>
          </div>

          {/* Multipliers */}
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Multipliers:</p>
            <div className="flex flex-wrap gap-2">
              {validation.impact_weight && (
                <Badge variant="outline" className="text-[10px]">
                  Impact: ×{validation.impact_weight}
                </Badge>
              )}
              {validation.trust_multiplier && (
                <Badge variant="outline" className="text-[10px]">
                  <Shield className="w-3 h-3 mr-0.5" /> Trust: ×{validation.trust_multiplier.toFixed(2)}
                </Badge>
              )}
              {validation.consistency_multiplier && validation.consistency_multiplier > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  Streak: ×{validation.consistency_multiplier}
                </Badge>
              )}
              {validation.explanation?.attendance_multiplier && validation.explanation.attendance_multiplier > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  <Users className="w-3 h-3 mr-0.5" /> Event: ×{validation.explanation.attendance_multiplier.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mint Info */}
      {validation.mint && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="py-3 px-4">
            <p className="text-sm font-medium mb-2">💰 FUN Money earned</p>
            <div className="flex justify-between text-xs">
              <span>Bạn nhận (99%):</span>
              <span className="font-bold text-amber-600">{validation.mint.mint_amount_user.toFixed(2)} FUN</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Platform (1%):</span>
              <span>{validation.mint.mint_amount_platform.toFixed(4)} FUN</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flags */}
      {validation.flags && validation.flags.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium mb-2">⚠️ Flags:</p>
            <div className="flex flex-wrap gap-1">
              {validation.flags.map((flag, i) => (
                <Badge key={i} variant="destructive" className="text-[10px]">{flag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Reasoning */}
      {validation.explanation?.reasoning && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium mb-1">🤖 AI nhận xét ({validation.explanation.validator || 'ai'}):</p>
            <p className="text-xs text-muted-foreground">{validation.explanation.reasoning}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
