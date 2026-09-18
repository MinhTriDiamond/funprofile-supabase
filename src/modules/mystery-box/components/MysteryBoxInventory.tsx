import { useState } from 'react';
import { useMysteryBoxInventory } from '../hooks/useMysteryBox';
import { TIER_COLORS, TIER_LABEL_VI, type BoxInventoryItem } from '../types';
import { MysteryBoxOpenDialog } from './MysteryBoxOpenDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Gift, Loader2, PackageOpen } from 'lucide-react';

export function MysteryBoxInventory() {
  const { data: items = [], isLoading } = useMysteryBoxInventory();
  const [openingBox, setOpeningBox] = useState<BoxInventoryItem | null>(null);

  const unopened = items.filter(i => !i.opened_at);
  const history = items.filter(i => i.opened_at).slice(0, 12);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Gift className="w-5 h-5" /> Hộp chưa mở ({unopened.length})
        </h2>
        {unopened.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Chưa có hộp nào. Hoàn thành nhiệm vụ, đăng nhập hằng ngày, hoặc mua trong Cửa hàng để nhận hộp.
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {unopened.map(item => {
              const tier = item.definition?.tier ?? 'common';
              const c = TIER_COLORS[tier];
              return (
                <Card key={item.id} className={`relative overflow-hidden bg-gradient-to-br ${c.bg} ${c.text} p-4 ring-2 ${c.ring} shadow-lg ${c.glow} transition-transform hover:scale-105`}>
                  <div className="text-xs uppercase opacity-80">{TIER_LABEL_VI[tier]}</div>
                  <div className="font-bold text-sm mt-1 line-clamp-2 min-h-[2.5rem]">{item.definition?.name_vi ?? 'Hộp bí ẩn'}</div>
                  <div className="text-5xl text-center my-3">{item.definition?.icon ?? '🎁'}</div>
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => setOpeningBox(item)}>
                    Mở ngay
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <PackageOpen className="w-5 h-5" /> Lịch sử gần đây
          </h2>
          <div className="space-y-2">
            {history.map(item => {
              const tier = item.definition?.tier ?? 'common';
              const r = item.reward_jsonb;
              return (
                <Card key={item.id} className="flex items-center gap-3 p-3">
                  <Badge className={`bg-gradient-to-br ${TIER_COLORS[tier].bg} ${TIER_COLORS[tier].text} border-0`}>
                    {TIER_LABEL_VI[tier]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.definition?.name_vi}</div>
                    {r && (
                      <div className="text-xs text-muted-foreground">
                        Nhận: {r.reward_code} ({r.value_int.toLocaleString()})
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.opened_at ? new Date(item.opened_at).toLocaleDateString('vi-VN') : ''}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <MysteryBoxOpenDialog
        open={!!openingBox}
        item={openingBox}
        onClose={() => setOpeningBox(null)}
      />
    </div>
  );
}
