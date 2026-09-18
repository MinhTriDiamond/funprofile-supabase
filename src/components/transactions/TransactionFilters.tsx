/**
 * TransactionFilters — bộ filter dùng chung, sync URL search params.
 * M5-UX6: thêm dropdown "Người dùng" (dynamic options theo filter hiện tại).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Search, Users, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import type { UnifiedFilters, UnifiedScope } from './types';
import { useUnifiedCounterparties } from '@/hooks/useUnifiedTransactionHistory';

const DIRECTIONS = [
  { v: 'all', l: 'Tất cả chiều' },
  { v: 'in', l: 'Nhận' },
  { v: 'out', l: 'Gửi' },
] as const;

const STATUSES = [
  { v: 'all', l: 'Tất cả trạng thái' },
  { v: 'success', l: 'Thành công' },
  { v: 'pending', l: 'Đang xử lý' },
  { v: 'failed', l: 'Thất bại' },
] as const;

interface Props {
  filters: UnifiedFilters;
  onChange: (next: UnifiedFilters) => void;
  availableTokens?: string[];
  availableChains?: string[];
  syncUrl?: boolean;
  targetUserId?: string | null;
  scope?: UnifiedScope;
}

export function TransactionFilters({
  filters, onChange, availableTokens = [], availableChains = [], syncUrl = false, targetUserId,
  scope = 'self',
}: Props) {
  const isGlobal = scope === 'global';
  const [sp, setSp] = useSearchParams();

  // Hydrate từ URL lần đầu
  useEffect(() => {
    if (!syncUrl) return;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawUser = (sp.get('user') || '').trim().toLowerCase();
    const userParam =
      !rawUser || rawUser === 'all' || rawUser === 'undefined' || rawUser === 'null' || !UUID_RE.test(rawUser)
        ? null
        : rawUser;
    const next: UnifiedFilters = {
      direction: (sp.get('direction') as UnifiedFilters['direction']) || 'all',
      status: sp.get('status') || 'all',
      chain: sp.get('chain') || 'all',
      token: sp.get('token') || 'all',
      type: sp.get('type') || 'all',
      dateFrom: sp.get('date_from'),
      dateTo: sp.get('date_to'),
      search: sp.get('search') || '',
      externalOnly: sp.get('external_only') === '1',
      counterpartyUserId: userParam,
    };
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search debounce: typing state riêng, chỉ commit sau 450ms.
  const [typingSearch, setTypingSearch] = useState<string>(filters.search ?? '');
  const debouncedSearch = useDebounce(typingSearch, 450);
  const lastCommittedRef = useRef<string>(filters.search ?? '');

  // Khi filters.search đổi từ ngoài (reset/hydrate URL) → đồng bộ typing.
  useEffect(() => {
    const ext = filters.search ?? '';
    if (ext !== lastCommittedRef.current) {
      setTypingSearch(ext);
      lastCommittedRef.current = ext;
    }
  }, [filters.search]);

  const update = (patch: Partial<UnifiedFilters>) => {
    const next = { ...filters, ...patch };
    if (patch.search !== undefined) lastCommittedRef.current = patch.search ?? '';
    onChange(next);
    if (syncUrl) {
      const newSp = new URLSearchParams(sp);
      const set = (k: string, v?: string | null) => {
        if (!v || v === 'all' || v === '') newSp.delete(k);
        else newSp.set(k, v);
      };
      set('direction', next.direction);
      set('status', next.status);
      set('chain', next.chain);
      set('token', next.token);
      set('type', next.type);
      set('date_from', next.dateFrom);
      set('date_to', next.dateTo);
      set('search', next.search);
      set('user', next.counterpartyUserId);
      if (next.externalOnly) newSp.set('external_only', '1');
      else newSp.delete('external_only');
      setSp(newSp, { replace: true });
    }
  };

  // Commit debounced search vào filters.
  useEffect(() => {
    if (debouncedSearch !== (filters.search ?? '')) {
      update({ search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const reset = () => {
    setTypingSearch('');
    update({
      direction: 'all', status: 'all', chain: 'all', token: 'all', type: 'all',
      dateFrom: null, dateTo: null, search: '', externalOnly: false, counterpartyUserId: null,
    });
  };


  const hasActive = useMemo(() => {
    return (
      (filters.direction && filters.direction !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      (filters.chain && filters.chain !== 'all') ||
      (filters.token && filters.token !== 'all') ||
      (filters.type && filters.type !== 'all') ||
      !!filters.dateFrom || !!filters.dateTo ||
      !!filters.externalOnly ||
      !!filters.counterpartyUserId ||
      (filters.search && filters.search.length > 0)
    );
  }, [filters]);

  const tokenOptions = useMemo(() => {
    const set = new Set(availableTokens.filter(Boolean));
    if (filters.token && filters.token !== 'all') set.add(filters.token);
    return Array.from(set);
  }, [availableTokens, filters.token]);

  const chainOptions = useMemo(() => {
    const set = new Set(availableChains.filter(Boolean));
    if (filters.chain && filters.chain !== 'all') set.add(filters.chain);
    return Array.from(set);
  }, [availableChains, filters.chain]);

  // Dynamic user options — dùng filter hiện tại (không apply counterpartyUserId)
  const counterpartiesQ = useUnifiedCounterparties({ targetUserId, filters });
  const users = counterpartiesQ.data ?? [];
  const selectedUser = users.find(u => u.user_id === filters.counterpartyUserId) ?? null;
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  const externalHint =
    !!filters.search &&
    filters.search.trim().toLowerCase() === 'ví ngoài' &&
    !filters.externalOnly;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typingSearch}
            onChange={(e) => setTypingSearch(e.target.value)}
            placeholder="Tìm tx hash / địa chỉ ví / tên / username / memo…"
            className="pl-8"
          />
        </div>

        {!isGlobal && (
          <Select value={filters.direction ?? 'all'} onValueChange={(v) => update({ direction: v as UnifiedFilters['direction'] })}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIRECTIONS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={filters.status ?? 'all'} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>

        {tokenOptions.length > 0 && (
          <Select value={filters.token ?? 'all'} onValueChange={(v) => update({ token: v })}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Token" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả token</SelectItem>
              {tokenOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {chainOptions.length > 0 && (
          <Select value={filters.chain ?? 'all'} onValueChange={(v) => update({ chain: v })}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Chain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chain</SelectItem>
              {chainOptions.map(c => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Dropdown Người dùng — dynamic options (ẩn ở scope=global) */}
        {!isGlobal && (
          <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 min-w-[200px] justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {selectedUser ? (
                    <>
                      <Avatar className="h-4 w-4 shrink-0">
                        {selectedUser.avatar_url && <AvatarImage src={selectedUser.avatar_url} />}
                        <AvatarFallback className="text-[9px]">
                          {(selectedUser.display_name ?? selectedUser.username ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs">{selectedUser.display_name ?? selectedUser.username ?? 'Người dùng'}</span>
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs">Tất cả người dùng</span>
                    </>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Tìm tên hoặc @username…" />
                <CommandList className="max-h-[320px]">
                  <CommandEmpty>
                    {counterpartiesQ.isLoading ? 'Đang tải…' : 'Không có người dùng khớp filter.'}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      onSelect={() => {
                        update({ counterpartyUserId: null });
                        setUserPopoverOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Check className={cn('h-4 w-4', !filters.counterpartyUserId ? 'opacity-100' : 'opacity-0')} />
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Tất cả người dùng</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {users.reduce((s, u) => s + u.tx_count, 0)} lệnh
                      </span>
                    </CommandItem>
                    {users.map(u => {
                      const name = u.display_name ?? u.username ?? 'Ẩn danh';
                      const searchable = `${name} ${u.username ?? ''}`;
                      return (
                        <CommandItem
                          key={u.user_id}
                          value={searchable}
                          onSelect={() => {
                            update({ counterpartyUserId: u.user_id });
                            setUserPopoverOpen(false);
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check className={cn('h-4 w-4', filters.counterpartyUserId === u.user_id ? 'opacity-100' : 'opacity-0')} />
                          <Avatar className="h-6 w-6 shrink-0">
                            {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                            <AvatarFallback className="text-[10px]">
                              {name.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{name}</div>
                            {u.username && (
                              <div className="truncate text-[10px] text-muted-foreground">@{u.username}</div>
                            )}
                          </div>
                          <span className="text-[11px] font-medium text-muted-foreground">{u.tx_count} lệnh</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}


        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">Từ ngày</label>
          <Input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => update({ dateFrom: e.target.value || null })}
            className="w-[150px]"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-muted-foreground">Đến ngày</label>
          <Input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => update({ dateTo: e.target.value || null })}
            className="w-[150px]"
          />
        </div>

        {hasActive ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="mr-1 h-4 w-4" /> Xoá filter
          </Button>
        ) : null}
      </div>

      {isGlobal ? (
        /* Global: Nguồn giao dịch (thay cho quick-badge Ví ngoài) */
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Nguồn giao dịch:</span>
          <Select
            value={filters.externalOnly ? 'external' : 'all'}
            onValueChange={(v) => {
              if (v === 'external') update({ externalOnly: true });
              else if (v === 'all') update({ externalOnly: false });
              // 'p2p' disabled — không xử lý
            }}
          >
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="external">Ví ngoài</SelectItem>
              <SelectItem value="p2p" disabled>Người ↔ Người (sắp có)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        /* Filter riêng "Ví ngoài" — không nhồi vào search */
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Lọc nhanh:</span>
          <Badge
            variant={filters.externalOnly ? 'default' : 'secondary'}
            className="cursor-pointer text-[11px]"
            onClick={() => update({ externalOnly: !filters.externalOnly })}
          >
            {filters.externalOnly ? '✓ ' : ''}Chỉ ví ngoài
          </Badge>
          {externalHint && (
            <Badge
              variant="outline"
              className="cursor-pointer text-[11px]"
              onClick={() => { setTypingSearch(''); update({ search: '', externalOnly: true }); }}
            >
              Chuyển sang filter "Ví ngoài"?
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
