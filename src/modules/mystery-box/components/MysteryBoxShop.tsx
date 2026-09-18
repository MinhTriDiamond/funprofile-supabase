import { useState } from 'react';
import { useMysteryBoxDefinitions } from '../hooks/useMysteryBox';
import { TIER_COLORS, TIER_LABEL_VI, type BoxDefinition } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Loader2 } from 'lucide-react';
import { MysteryBoxPurchaseDialog } from './MysteryBoxPurchaseDialog';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';

export function MysteryBoxShop() {
  const { data: defs = [], isLoading } = useMysteryBoxDefinitions();
  const [selected, setSelected] = useState<BoxDefinition | null>(null);

  const shopItems = defs.filter(d => d.cost_camly && d.cost_camly > 0);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Dùng CAMLY (BSC) để mua hộp cao cấp. Giao dịch on-chain — bạn sẽ ký trên ví và CAMLY được trừ thật.
        Sau khi xác nhận, hộp xuất hiện ngay trong Kho hộp.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shopItems.map(def => {
          const c = TIER_COLORS[def.tier];
          return (
            <Card key={def.id} className={`p-4 bg-gradient-to-br ${c.bg} ${c.text} ring-2 ${c.ring} shadow-lg ${c.glow}`}>
              <Badge variant="secondary" className="mb-2">{TIER_LABEL_VI[def.tier]}</Badge>
              <div className="text-lg font-bold">{def.name_vi}</div>
              <div className="text-6xl text-center my-4">🎁</div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 font-semibold">
                  <Coins className="w-4 h-4" />
                  {def.cost_camly?.toLocaleString()}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(def)}
                >
                  Mua
                </Button>
              </div>
            </Card>
          );
        })}
        {shopItems.length === 0 && (
          <Card className="col-span-full p-8 text-center text-muted-foreground">
            Cửa hàng đang được cập nhật.
          </Card>
        )}
      </div>

      {selected && (
        <OptionalWeb3Provider>
          <MysteryBoxPurchaseDialog
            def={selected}
            open={!!selected}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </OptionalWeb3Provider>
      )}
    </div>
  );
}
