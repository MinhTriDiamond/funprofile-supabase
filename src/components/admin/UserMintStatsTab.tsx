import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, ChevronDown, ChevronUp, ArrowUpDown, Loader2, ExternalLink,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { formatFUN } from '@/config/pplp';

interface UserMintStat {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  total_actions: number;
  total_light_score: number;
  epoch_allocated: number;
  pending_count: number;
  signed_count: number;
  submitted_count: number;
  confirmed_count: number;
  failed_count: number;
  total_minted: number;
}

interface MintRequestDetail {
  id: string;
  status: string;
  amount_display: number | null;
  action_name: string | null;
  tx_hash: string | null;
  created_at: string;
  error_message: string | null;
}

type SortKey = keyof Pick<UserMintStat,
  'total_actions' | 'total_light_score' | 'epoch_allocated' |
  'pending_count' | 'signed_count' | 'submitted_count' |
  'confirmed_count' | 'failed_count' | 'total_minted'
>;

const PAGE_SIZE = 20;

const UserMintStatsTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_light_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['user-mint-stats', debouncedSearch],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_mint_stats', {
        search_query: debouncedSearch,
      });
      if (error) throw error;
      return (data || []) as UserMintStat[];
    },
    staleTime: 60_000,
  });

  // Fetch details for expanded user
  const { data: userDetails = [], isLoading: detailsLoading } = useQuery({
    queryKey: ['user-mint-details', expandedUserId],
    queryFn: async () => {
      if (!expandedUserId) return [];
      const { data, error } = await supabase
        .from('pplp_mint_requests')
        .select('id, status, amount_display, action_name, tx_hash, created_at, error_message')
        .eq('user_id', expandedUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as MintRequestDetail[];
    },
    enabled: !!expandedUserId,
    staleTime: 30_000,
  });

  const sorted = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      const av = (a[sortKey] as number) || 0;
      const bv = (b[sortKey] as number) || 0;
      return sortAsc ? av - bv : bv - av;
    });
    return arr;
  }, [stats, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Summary
  const summary = useMemo(() => {
    return stats.reduce(
      (acc, s) => ({
        actions: acc.actions + s.total_actions,
        ls: acc.ls + s.total_light_score,
        epoch: acc.epoch + s.epoch_allocated,
        pending: acc.pending + s.pending_count,
        signed: acc.signed + s.signed_count,
        submitted: acc.submitted + s.submitted_count,
        confirmed: acc.confirmed + s.confirmed_count,
        failed: acc.failed + s.failed_count,
        minted: acc.minted + s.total_minted,
      }),
      { actions: 0, ls: 0, epoch: 0, pending: 0, signed: 0, submitted: 0, confirmed: 0, failed: 0, minted: 0 },
    );
  }, [stats]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50 text-right whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        {sortKey === field ? (
          sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </div>
    </TableHead>
  );

  const getStatusBadge = (status: string) => {
    const map: Record<string, { className: string; label: string }> = {
      pending_sig: { className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', label: 'Chờ ký' },
      signing: { className: 'bg-orange-500/10 text-orange-600 border-orange-500/30', label: 'Đang ký' },
      signed: { className: 'bg-blue-500/10 text-blue-600 border-blue-500/30', label: 'Đã ký' },
      submitted: { className: 'bg-purple-500/10 text-purple-600 border-purple-500/30', label: 'Đã gửi' },
      confirmed: { className: 'bg-green-500/10 text-green-600 border-green-500/30', label: 'Hoàn tất' },
      failed: { className: 'bg-red-500/10 text-red-600 border-red-500/30', label: 'Thất bại' },
      rejected: { className: 'bg-red-500/10 text-red-600 border-red-500/30', label: 'Từ chối' },
    };
    const info = map[status] || { className: '', label: status };
    return <Badge variant="outline" className={info.className}>{info.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Tìm kiếm theo username..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-center text-xs">
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-muted-foreground">Users</div>
              <div className="text-lg font-bold">{stats.length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-muted-foreground">Tổng Actions</div>
              <div className="text-lg font-bold">{summary.actions.toLocaleString()}</div>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-2">
              <div className="text-muted-foreground">Light Score</div>
              <div className="text-lg font-bold text-amber-500">{formatFUN(summary.ls)}</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2">
              <div className="text-muted-foreground">Đã Mint</div>
              <div className="text-lg font-bold text-green-500">{formatFUN(summary.minted)}</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-2">
              <div className="text-muted-foreground">Epoch Allocated</div>
              <div className="text-lg font-bold text-blue-500">{formatFUN(summary.epoch)}</div>
            </div>
          </div>

          {/* Table */}
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>User</TableHead>
                  <SortHeader label="Actions" field="total_actions" />
                  <SortHeader label="Light Score" field="total_light_score" />
                  <SortHeader label="Epoch" field="epoch_allocated" />
                  <SortHeader label="Chờ ký" field="pending_count" />
                  <SortHeader label="Đã ký" field="signed_count" />
                  <SortHeader label="Đã gửi" field="submitted_count" />
                  <SortHeader label="Hoàn tất" field="confirmed_count" />
                  <SortHeader label="Thất bại" field="failed_count" />
                  <SortHeader label="FUN Minted" field="total_minted" />
                  <TableHead>Ví</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((u, idx) => (
                  <>
                    <TableRow
                      key={u.user_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedUserId(expandedUserId === u.user_id ? null : u.user_id)}
                    >
                      <TableCell className="text-muted-foreground text-xs">{page * PAGE_SIZE + idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={u.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">{u.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                          </Avatar>
                          <span className="truncate text-sm font-medium">@{u.username || 'N/A'}</span>
                          {expandedUserId === u.user_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 opacity-40" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{u.total_actions.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium text-amber-500">{formatFUN(u.total_light_score)}</TableCell>
                      <TableCell className="text-right">{formatFUN(u.epoch_allocated)}</TableCell>
                      <TableCell className="text-right">
                        {u.pending_count > 0 && <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">{u.pending_count}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.signed_count > 0 && <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">{u.signed_count}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.submitted_count > 0 && <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">{u.submitted_count}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.confirmed_count > 0 && <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">{u.confirmed_count}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.failed_count > 0 && <Badge variant="destructive">{u.failed_count}</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-500">{u.total_minted > 0 ? formatFUN(u.total_minted) : '-'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {u.wallet_address ? (
                          <a
                            href={`https://testnet.bscscan.com/address/${u.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {u.wallet_address.slice(0, 6)}…{u.wallet_address.slice(-4)}
                          </a>
                        ) : (
                          <span className="text-destructive italic">Chưa có</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail row */}
                    {expandedUserId === u.user_id && (
                      <TableRow key={`${u.user_id}-detail`}>
                        <TableCell colSpan={12} className="bg-muted/30 p-4">
                          {detailsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải chi tiết...
                            </div>
                          ) : userDetails.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Chưa có mint request nào</div>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                Danh sách Mint Requests ({userDetails.length})
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">ID</TableHead>
                                    <TableHead className="text-xs">Trạng thái</TableHead>
                                    <TableHead className="text-xs text-right">FUN</TableHead>
                                    <TableHead className="text-xs">Action</TableHead>
                                    <TableHead className="text-xs">TX</TableHead>
                                    <TableHead className="text-xs">Thời gian</TableHead>
                                    <TableHead className="text-xs">Lỗi</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {userDetails.map((req) => (
                                    <TableRow key={req.id} className="text-xs">
                                      <TableCell className="font-mono">{req.id.slice(0, 8)}…</TableCell>
                                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                                      <TableCell className="text-right font-medium">
                                        {req.amount_display ? formatFUN(req.amount_display) : '-'}
                                      </TableCell>
                                      <TableCell>{req.action_name || '-'}</TableCell>
                                      <TableCell>
                                        {req.tx_hash ? (
                                          <a
                                            href={`https://testnet.bscscan.com/tx/${req.tx_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline flex items-center gap-1"
                                          >
                                            {req.tx_hash.slice(0, 8)}… <ExternalLink className="w-3 h-3" />
                                          </a>
                                        ) : '-'}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {new Date(req.created_at).toLocaleDateString('vi-VN')}
                                      </TableCell>
                                      <TableCell className="text-destructive max-w-[200px] truncate" title={req.error_message || ''}>
                                        {req.error_message || ''}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Trang {page + 1} / {totalPages} · {sorted.length} users
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  ← Trước
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Sau →
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserMintStatsTab;
