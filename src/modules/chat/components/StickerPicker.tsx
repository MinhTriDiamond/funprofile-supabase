import { useState } from 'react';
import { useStickers } from '../hooks/useStickers';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import type { Sticker } from '../types';

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
}

export function StickerPicker({ onSelect }: StickerPickerProps) {
  const { packs, stickersByPack, isLoading } = useStickers();
  const [activePack, setActivePack] = useState<string>('');

  if (isLoading) {
    return (
      <div className="w-72 h-64 p-3">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="w-14 h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div className="w-72 h-32 flex items-center justify-center text-sm text-muted-foreground">
        Chưa có sticker nào
      </div>
    );
  }

  const currentPackId = activePack || packs[0]?.id || '';
  const currentStickers = stickersByPack.get(currentPackId) || [];

  return (
    <div className="w-72">
      <Tabs value={currentPackId} onValueChange={setActivePack}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {packs.map(pack => (
            <TabsTrigger key={pack.id} value={pack.id} className="text-xs px-2">
              {pack.preview_url ? (
                <img src={pack.preview_url} alt={pack.name} className="w-6 h-6 object-contain" />
              ) : (
                pack.name.slice(0, 4)
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {packs.map(pack => (
          <TabsContent key={pack.id} value={pack.id} className="mt-0">
            <ScrollArea className="h-48">
              <div className="grid grid-cols-4 gap-2 p-2">
                {(stickersByPack.get(pack.id) || []).map(sticker => (
                  <button
                    key={sticker.id}
                    onClick={() => onSelect(sticker)}
                    className="w-14 h-14 rounded-lg hover:bg-muted transition-colors flex items-center justify-center"
                  >
                    <img src={sticker.url} alt={sticker.name} className="w-12 h-12 object-contain" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
