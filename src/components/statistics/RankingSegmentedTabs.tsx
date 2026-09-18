import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface RankingSegment {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  content: React.ReactNode;
}

export interface RankingSegmentedTabsProps {
  segments: RankingSegment[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function RankingSegmentedTabs({
  segments,
  value,
  onChange,
  className,
}: RankingSegmentedTabsProps) {
  return (
    <Tabs value={value} onValueChange={onChange} className={cn('w-full', className)}>
      <TabsList
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
      >
        {segments.map((s) => (
          <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
            {s.icon}
            <span className="truncate">{s.label}</span>
            {s.badge !== undefined && s.badge !== '' && (
              <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {s.badge}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {segments.map((s) => (
        <TabsContent key={s.key} value={s.key} className="mt-4">
          {s.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
