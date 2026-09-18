import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ExternalLink, Search } from 'lucide-react';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import {
  useTreasuryPublicInflows,
  type TreasurySource,
} from '@/hooks/useTreasuryPublicInflows';

type Filter = 'all' | TreasurySource;

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');

export default function TreasuryPublicHistory() {
  const [source, setSource] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);

  const { data, isLoading } = useTreasuryPublicInflows(limit);

  const filtered = useMemo(() => {
    const list = (data || []).filter((r) => (source === 'all' ? true : r.source === source));
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (r) =>
        (r.username || '').toLowerCase().includes(s) ||
        (r.display_name || '').toLowerCase().includes(s) ||
        (r.item || '').toLowerCase().includes(s) ||
        (r.tx_hash || '').toLowerCase().includes(s),
    );
  }, [data, source, search]);

  const exportCSV = () => {
    const header = 'Thời gian,Nguồn,User,Item,CAMLY,TX Hash\n';
    const body = filtered
      .map(
        (r) =>
          `${r.confirmed_at},${r.source},${r.display_name || r.username || r.user_id},${r.item},${r.price_camly},${r.tx_hash || ''}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `treasury-public-inflows-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Lịch sử dòng tiền vào ví Treasury</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Toàn bộ CAMLY từ Cửa hàng Lumi và Hộp bí ẩn chảy về ví Treasury chung. Mọi
              người đều có thể đối soát on-chain qua BscScan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={source} onValueChange={(v) => setSource(v as Filter)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="pet">Cửa hàng Lumi</SelectItem>
                <SelectItem value="mystery">Hộp bí ẩn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm user / item / tx..."
                className="pl-8 w-[200px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Chưa có giao dịch nào phù hợp.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2">Thời gian</th>
                  <th className="py-2 pr-2">Nguồn</th>
                  <th className="py-2 pr-2">Người mua</th>
                  <th className="py-2 pr-2">Vật phẩm</th>
                  <th className="py-2 pr-2 text-right">CAMLY</th>
                  <th className="py-2 pr-2">TX</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const displayName = r.display_name || r.username || `user-${r.user_id.slice(0, 6)}`;
                  return (
                    <tr key={r.uid} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.confirmed_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={r.source === 'pet' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {r.source === 'pet' ? 'Cửa hàng Lumi' : 'Hộp bí ẩn'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 max-w-[200px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={r.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {displayName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            {r.username ? (
                              <a
                                href={`/u/${r.username}`}
                                className="font-medium hover:underline truncate block"
                              >
                                @{r.username}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground truncate block">
                                {r.user_id.slice(0, 8)}…
                              </span>
                            )}
                            {r.display_name && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                {r.display_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-2 truncate max-w-[160px]">{r.item}</td>
                      <td className="py-2 pr-2 text-right font-semibold">
                        {fmt(r.price_camly)}
                      </td>
                      <td className="py-2 pr-2">
                        {r.tx_hash ? (
                          <a
                            href={getBscScanTxUrl(r.tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="font-mono text-xs">{r.tx_hash.slice(0, 8)}…</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
