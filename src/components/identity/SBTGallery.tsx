import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SBTCard } from './SBTCard';
import { Award } from 'lucide-react';

const CATS = ['all', 'identity', 'trust', 'contribution', 'credential', 'milestone', 'legacy'] as const;

export function SBTGallery({ sbts }: { sbts: any[] }) {
  const [tab, setTab] = useState<string>('all');
  const filtered = tab === 'all' ? sbts : sbts.filter((s) => s.sbt_category === tab);

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 sm:grid-cols-7 w-full">
          {CATS.map((c) => (
            <TabsTrigger key={c} value={c} className="capitalize text-xs">{c}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có SBT nào trong nhóm này</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((s) => <SBTCard key={s.token_id} sbt={s} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
