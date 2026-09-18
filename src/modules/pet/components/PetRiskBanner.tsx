import { AlertCircle, ShieldAlert, ShieldX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { usePetRisk, petRiskTierLabel } from '../hooks/usePetRisk';

const REASON_LABEL: Record<string, string> = {
  xp_burst: 'Tăng XP đột biến',
  cheer_loop: 'Vỗ tay vòng tròn',
  self_cheer: 'Tự vỗ tay chính mình',
  box_streak: 'Mở box liên tục',
  shop_velocity: 'Mua trang phục bất thường',
  device_share: 'Chung thiết bị nhiều linh thú',
  ip_share: 'Chung IP nhiều linh thú',
  tc_low: 'Điểm Trust thấp',
};

export function PetRiskBanner() {
  const { data } = usePetRisk();
  if (!data || data.risk_tier === 'safe') return null;

  const { label } = petRiskTierLabel(data.risk_tier);
  const Icon = data.risk_tier === 'frozen' ? ShieldX : data.risk_tier === 'restricted' ? ShieldAlert : AlertCircle;
  const variant: 'default' | 'destructive' = data.risk_tier === 'watch' ? 'default' : 'destructive';

  return (
    <Alert variant={variant} className="mb-4">
      <Icon className="h-4 w-4" />
      <AlertTitle>Linh thú đang ở mức: {label}</AlertTitle>
      <AlertDescription className="space-y-2">
        {data.last_reasons?.length > 0 && (
          <div className="text-xs">
            Lý do: {data.last_reasons.map(r => REASON_LABEL[r] ?? r).join(' • ')}
          </div>
        )}
        {data.risk_tier === 'watch' && (
          <div className="text-xs">Bạn vẫn chơi bình thường. Hệ thống đang theo dõi để đảm bảo công bằng.</div>
        )}
        {data.risk_tier === 'restricted' && (
          <div className="text-xs">Tạm thời không thể mua shop và vỗ tay cho người lạ. XP nhận được giảm 50%.</div>
        )}
        {data.risk_tier === 'frozen' && (
          <div className="text-xs">Mọi hoạt động sinh thưởng tạm khoá. Vui lòng kháng nghị nếu bạn nghĩ đây là nhầm lẫn.</div>
        )}
        {(
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/pet/appeal">Kháng nghị</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
