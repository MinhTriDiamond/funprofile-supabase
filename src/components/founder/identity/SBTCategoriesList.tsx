import { Award } from 'lucide-react';

const CAT_VI: Record<string, string> = {
  identity: 'Danh Tính',
  trust: 'Tín Nhiệm',
  contribution: 'Cống Hiến',
  credential: 'Chứng Chỉ',
  milestone: 'Cột Mốc',
  legacy: 'Di Sản',
  governance: 'Quản Trị',
  social: 'Cộng Đồng',
};

export function SBTCategoriesList({ sbtByCategory }: { sbtByCategory: Record<string, number> }) {
  const entries = Object.entries(sbtByCategory).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 6);
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Award className="h-4 w-4 text-amber-500" /> Top danh mục SBT
      </p>
      <div className="space-y-1.5">
        {entries.map(([cat, count]) => (
          <div key={cat} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{CAT_VI[cat] || cat.replace(/_/g, ' ')}</span>
            <span className="font-medium tabular-nums">{Number(count).toLocaleString('vi-VN')}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Chưa có SBT nào được phát hành</p>
        )}
      </div>
    </div>
  );
}
