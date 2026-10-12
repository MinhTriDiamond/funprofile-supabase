import { useState, useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';

const LOCALES: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', th: 'th-TH', fr: 'fr-FR', id: 'id-ID', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', ru: 'ru-RU', ar: 'ar-EG' };
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useUserDirectory, getTierName } from '@/hooks/useUserDirectory';
import { UserDirectoryFilters } from '@/components/users/UserDirectoryFilters';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download, Users as UsersIcon, Search, ChevronLeft, ChevronRight,
  Coins, Gift, Star, FileText, MessageSquare, Wallet, Send, ArrowDownToLine,
  Globe, TrendingUp, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  ShieldBan, Pause, Unlock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { describeBackendError } from '@/lib/errors';

import { useToast } from '@/hooks/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminUserServerSearch } from '@/hooks/useAdminUserServerSearch';

const Users = () => {
  const { t, language } = useLanguage();
  const loc = LOCALES[language] || 'en-US';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userId: authUserId } = useCurrentUser();
  const {
    users, isLoading, stats, search, setSearch, page, setPage, totalPages, exportCSV, allUsers, filters, setFilters, isAdmin, emailsMap, sortBy, setSortBy,
  } = useUserDirectory();

  // Fallback: tìm trực tiếp trên hệ thống khi danh sách đã tải không có kết quả
  const { data: serverSearch, isFetching: isSearchingServer } = useAdminUserServerSearch(
    search,
    users.length === 0 && search.trim().length >= 2,
  );
  const serverResults = serverSearch ?? [];

  const [emailFilter, setEmailFilter] = useState('');
  const [emailPopoverOpen, setEmailPopoverOpen] = useState(false);

  const sortedEmails = useMemo(() => {
    if (!emailsMap || emailsMap.size === 0) return [];
    const emails = Array.from(new Set(emailsMap.values())).filter(Boolean).sort((a, b) => a.localeCompare(b));
    if (!emailFilter.trim()) return emails;
    const q = emailFilter.toLowerCase();
    return emails.filter(e => e.toLowerCase().includes(q));
  }, [emailsMap, emailFilter]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; username: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Hover status action states
  const [hoverUserId, setHoverUserId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{ id: string; username: string; type: 'ban' | 'suspend' | 'unlock' | 'unban' } | null>(null);
  const [isActioning, setIsActioning] = useState(false);

  const fmt = (n: number) => n.toLocaleString(loc);
  const shortenAddr = (addr: string | null) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString(loc) : '—';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: deleteTarget.id },
      });
      if (res.error) throw res.error;
      toast({ title: t('usrDeletedTitle'), description: `@${deleteTarget.username}${t('usrDeletedDescSuffix')}` });
      queryClient.invalidateQueries({ queryKey: ['user-directory'] });
      queryClient.invalidateQueries({ queryKey: ['user-directory-admin-check'] });
    } catch (err: unknown) {
      console.error('[Users] admin-delete-user failed', { userId: deleteTarget?.id, err });
      toast({ title: t('usrErrorTitle'), description: describeBackendError(err, t('usrDeleteFail')), variant: 'destructive' });

    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleStatusAction = async () => {
    if (!actionTarget) return;
    setIsActioning(true);
    try {
      if (actionTarget.type === 'ban') {
        if (!authUserId) throw new Error(t('usrAdminAuthFail'));
        const { error } = await supabase.rpc('ban_user_permanently', {
          p_admin_id: authUserId,
          p_user_id: actionTarget.id,
          p_reason: 'Banned from user directory by admin',
        });
        if (error) throw error;
        toast({ title: t('usrBannedTitle'), description: `@${actionTarget.username}${t('usrBannedDescSuffix')}` });
      } else if (actionTarget.type === 'suspend') {
        const { data, error } = await supabase.from('profiles').update({ reward_status: 'on_hold' }).eq('id', actionTarget.id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error(t('usrNoPermission'));
        toast({ title: t('usrSuspendedTitle'), description: `@${actionTarget.username}${t('usrSuspendedDescSuffix')}` });
      } else if (actionTarget.type === 'unlock') {
        const { data, error } = await supabase.from('profiles').update({ reward_status: 'approved' }).eq('id', actionTarget.id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error(t('usrNoPermission'));
        toast({ title: t('usrUnlockedTitle'), description: `@${actionTarget.username}${t('usrUnlockedDescSuffix')}` });
      } else if (actionTarget.type === 'unban') {
        if (!authUserId) throw new Error(t('usrAdminAuthFail'));
        const { error } = await supabase.rpc('unban_user', {
          p_admin_id: authUserId,
          p_user_id: actionTarget.id,
          p_reason: 'Unbanned from user directory by admin',
        });
        if (error) throw error;
        toast({ title: t('usrUnlockedTitle'), description: `@${actionTarget.username}${t('usrUnbannedDescSuffix')}` });
      }
      // Optimistic update cache ngay lập tức
      queryClient.setQueryData(['user-directory'], (old: any[]) => {
        if (!old) return old;
        return old.map(u => {
          if (u.id !== actionTarget.id) return u;
          if (actionTarget.type === 'ban') return { ...u, is_banned: true, reward_status: 'banned' };
          if (actionTarget.type === 'suspend') return { ...u, reward_status: 'on_hold' };
          if (actionTarget.type === 'unlock') return { ...u, reward_status: 'approved' };
          if (actionTarget.type === 'unban') return { ...u, is_banned: false, reward_status: 'approved' };
          return u;
        });
      });

      // Refetch để đồng bộ chính xác từ DB
      await queryClient.refetchQueries({ queryKey: ['user-directory'] });
    } catch (err: unknown) {
      console.error('[Users] status action failed', {
        type: actionTarget?.type, userId: actionTarget?.id, username: actionTarget?.username, err,
      });
      toast({ title: t('usrErrorTitle'), description: describeBackendError(err), variant: 'destructive' });

    } finally {
      setIsActioning(false);
      setActionTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav px-2 md:px-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between py-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t('usrTitle')}</h1>
            <p className="text-sm text-muted-foreground">{fmt(stats.totalUsers)}{t('usrMembersSuffix')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" />{t('usrExport')}
          </Button>
        </div>

        {/* Stats Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
          <StatCard icon={UsersIcon} label={t("usrStatTotal")} value={fmt(stats.totalUsers)} color="text-blue-500" />
          <StatCard icon={Coins} label={t("usrStatPending")} value={fmt(stats.totalPending)} color="text-amber-500" />
          <StatCard icon={Gift} label={t("usrStatClaimed")} value={fmt(stats.totalCamlyClaimed)} color="text-emerald-500" />
          <StatCard icon={TrendingUp} label={t("usrStatCalculated")} value={fmt(stats.totalCamlyCalculated)} color="text-purple-500" />
          <StatCard icon={ArrowDownToLine} label={t("usrStatWithdrawn")} value={fmt(stats.totalWithdrawn)} color="text-red-500" />
        </div>

        {/* Stats Row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
          <StatCard icon={Star} label="FUN Money" value={fmt(stats.totalMinted)} color="text-yellow-500" />
          <StatCard icon={Send} label={t("usrStatInternalSent")} value={fmt(Math.round(stats.totalInternalSent))} color="text-sky-500" />
          <StatCard icon={Gift} label={t("usrStatInternalReceived")} value={fmt(Math.round(stats.totalInternalReceived))} color="text-teal-500" />
          <StatCard icon={Globe} label={t("usrStatWeb3Sent")} value={fmt(Math.round(stats.totalWeb3Sent))} color="text-indigo-500" />
          <StatCard icon={Wallet} label={t("usrStatWeb3Received")} value={fmt(Math.round(stats.totalWeb3Received))} color="text-pink-500" />
        </div>

        {/* Stats Row 3 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatCard icon={FileText} label={t("usrStatPosts")} value={fmt(stats.totalPosts)} color="text-orange-500" />
          <StatCard icon={MessageSquare} label={t("usrStatComments")} value={fmt(stats.totalComments)} color="text-cyan-500" />
          <StatCard icon={Star} label={t("usrStatLightScore")} value={fmt(stats.totalLightScore)} color="text-violet-500" />
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("usrSearchPlaceholder")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-10"
            />
          </div>
          <UserDirectoryFilters filters={filters} onChange={(f) => { setFilters(f); setPage(0); }} />
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground mb-2">
          {t('usrThisPage')}<span className="font-semibold text-foreground">{users.length}</span>
          {' · '}{t('usrAfterFilter')}<span className="font-semibold text-foreground">{allUsers.length}</span>
          {' · '}{t('usrWholeSystem')}<span className="font-semibold text-foreground">{fmt(stats.totalUsers)}</span>
          {allUsers.length < stats.totalUsers && (
            <span className="ml-1 text-amber-600">{t('usrHiddenA')}{fmt(stats.totalUsers - allUsers.length)}{t('usrHiddenB')}</span>
          )}
        </p>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : (
          <div className="border rounded-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead className="min-w-[160px]">
                    <div className="flex items-center gap-1">
                      {t('usrUser')}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setSortBy(sortBy === 'username-asc' ? 'username-desc' : sortBy === 'username-desc' ? 'default' : 'username-asc')}
                      >
                        {sortBy === 'username-asc' ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : sortBy === 'username-desc' ? <ArrowDown className="h-3.5 w-3.5 text-primary" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableHead>
                  {isAdmin && (
                    <TableHead className="hidden md:table-cell min-w-[180px]">
                      <div className="flex items-center gap-1">
                        Email
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setSortBy(sortBy === 'email-asc' ? 'email-desc' : sortBy === 'email-desc' ? 'default' : 'email-asc')}
                        >
                          {sortBy === 'email-asc' ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : sortBy === 'email-desc' ? <ArrowDown className="h-3.5 w-3.5 text-primary" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                        </Button>
                        <Popover open={emailPopoverOpen} onOpenChange={setEmailPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <Search className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-2" align="start">
                            <Input
                              placeholder={t("usrSearchEmail")}
                              value={emailFilter}
                              onChange={(e) => setEmailFilter(e.target.value)}
                              className="h-8 text-xs mb-2"
                            />
                            <ScrollArea className="h-64">
                              {sortedEmails.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">{t('usrNotFound')}</p>
                              ) : (
                                sortedEmails.map((email) => (
                                  <button
                                    key={email}
                                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 truncate transition-colors"
                                    onClick={() => {
                                      setSearch(email);
                                      setPage(0);
                                      setEmailPopoverOpen(false);
                                      setEmailFilter('');
                                    }}
                                  >
                                    {email}
                                  </button>
                                ))
                              )}
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                  )}
                  <TableHead className="w-20">{t('usrColStatus')}</TableHead>
                  <TableHead className="hidden md:table-cell w-24">Tham gia</TableHead>
                  <TableHead className="hidden md:table-cell w-20">{t('usrColPostsComments')}</TableHead>
                  <TableHead className="hidden lg:table-cell w-24">{t('usrColLight')}</TableHead>
                  <TableHead className="w-24">{t('usrColBalance')}</TableHead>
                  <TableHead className="hidden md:table-cell w-24">{t('usrColTotalRewards')}</TableHead>
                  <TableHead className="hidden lg:table-cell w-20">FUN</TableHead>
                  <TableHead className="hidden lg:table-cell w-24">{t('usrColInternalGift')}</TableHead>
                  <TableHead className="hidden xl:table-cell w-24">{t('usrColWeb3Gift')}</TableHead>
                  <TableHead className="hidden md:table-cell w-20">{t('usrColWithdrawn')}</TableHead>
                  <TableHead className="hidden lg:table-cell w-28">{t('usrColBscWallet')}</TableHead>
                  {isAdmin && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 15 : 13} className="text-center py-12 text-muted-foreground">
                      <UsersIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      {serverResults.length > 0 ? (
                        <div className="space-y-2">
                          <p>{t('usrNotInList')}</p>
                          <div className="flex flex-col items-center gap-1">
                            {serverResults.map((u) => (
                              <button
                                key={u.id}
                                className="text-sm text-primary hover:underline"
                                onClick={() => navigate(`/profile/${u.id}`)}
                              >
                                @{u.username} {u.full_name ? `— ${u.full_name}` : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p>{isSearchingServer ? t('usrSearching') : t('usrNoMembers')}</p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user, idx) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => navigate(`/profile/${user.id}`)}
                    >
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {page * 50 + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {user.username?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">@{user.username}</p>
                            {user.full_name && (
                              <p className="text-xs text-muted-foreground truncate">{user.full_name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate max-w-[200px]">
                          {user.email || '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        <div
                          onMouseEnter={() => isAdmin && setHoverUserId(user.id)}
                          onMouseLeave={() => setHoverUserId(null)}
                          className="relative min-h-[28px] flex items-center"
                        >
                          {isAdmin && hoverUserId === user.id ? (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {user.is_banned ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                  title={t("usrUnlockTitle")}
                                  onClick={() => setActionTarget({ id: user.id, username: user.username, type: 'unban' })}
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                                    title={t("usrBanTitle")}
                                    onClick={() => setActionTarget({ id: user.id, username: user.username, type: 'ban' })}
                                  >
                                    <ShieldBan className="w-3.5 h-3.5" />
                                  </Button>
                                  {user.reward_status === 'on_hold' ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                      title={t("usrUnlock")}
                                      onClick={() => setActionTarget({ id: user.id, username: user.username, type: 'unlock' })}
                                    >
                                      <Unlock className="w-3.5 h-3.5" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-orange-600 hover:bg-orange-500/10 hover:text-orange-700"
                                      title={t("usrSuspend")}
                                      onClick={() => setActionTarget({ id: user.id, username: user.username, type: 'suspend' })}
                                    >
                                      <Pause className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            user.is_banned ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5">{t('usrBadgeBanned')}</Badge>
                            ) : user.reward_status === 'on_hold' ? (
                              <Badge className="text-[10px] px-1.5 bg-orange-500/10 text-orange-600 border-orange-500/20">{t('usrBadgeSuspended')}</Badge>
                            ) : (
                              <Badge className="text-[10px] px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{t('usrBadgeActive')}</Badge>
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {fmtDate(user.created_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        <span title={t("usrPostsTitle")}>📝{user.posts_count}</span>
                        <span className="text-muted-foreground mx-0.5">/</span>
                        <span title={t("usrCommentsTitle")}>💬{user.comments_count}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-xs">
                          <p className="font-semibold text-purple-500">⭐ {fmt(user.total_light_score)}</p>
                          <p className="text-muted-foreground">{getTierName(user.tier)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="text-amber-500 font-semibold">
                            {fmt(user.camly_calculated - user.camly_claimed)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs font-semibold text-amber-600">
                        {fmt(user.camly_calculated)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        {user.total_minted > 0 ? (
                          <span className="text-yellow-600 font-medium">{fmt(user.total_minted)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        <p className="text-sky-500">↑{fmt(Math.round(user.internal_sent))}</p>
                        <p className="text-teal-500">↓{fmt(Math.round(user.internal_received))}</p>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs">
                        <p className="text-indigo-500">↑{fmt(Math.round(user.web3_sent))}</p>
                        <p className="text-pink-500">↓{fmt(Math.round(user.web3_received))}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        {user.camly_claimed > 0 ? (
                          <span className="text-emerald-500 font-medium">{fmt(user.camly_claimed)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {user.wallet_address ? (
                          <a
                            href={`https://bscscan.com/address/${user.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {shortenAddr(user.wallet_address)}
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: user.id, username: user.username });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4 mb-8">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Trang {page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </main>
      <MobileBottomNav />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('usrDeleteDialogA')}{deleteTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t('usrDeleteDialogDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('usrCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('usrDeleting') : t('usrDeleteForever')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Action Confirmation Dialog */}
      <AlertDialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.type === 'ban' ? `${t('usrBanQ')}${actionTarget?.username}?` :
               actionTarget?.type === 'suspend' ? `${t('usrSuspendQ')}${actionTarget?.username}?` :
               actionTarget?.type === 'unban' ? `${t('usrUnbanQ')}${actionTarget?.username}?` :
               `${t('usrUnlockQ')}${actionTarget?.username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget?.type === 'ban' ? t('usrBanDesc') :
               actionTarget?.type === 'suspend' ? t('usrSuspendDesc') :
               actionTarget?.type === 'unban' ? t('usrUnbanDesc') :
               t('usrUnlockDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActioning}>{t('usrCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStatusAction}
              disabled={isActioning}
              className={actionTarget?.type === 'ban' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' :
                         actionTarget?.type === 'suspend' ? 'bg-orange-600 text-white hover:bg-orange-700' :
                         'bg-emerald-600 text-white hover:bg-emerald-700'}
            >
              {isActioning ? t('capRevoking') :
               actionTarget?.type === 'ban' ? t('usrBanBtn') :
               actionTarget?.type === 'suspend' ? t('usrSuspend') :
               actionTarget?.type === 'unban' ? t('usrUnbanBtn') : t('usrUnlock')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Small stat card component
const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="bg-card border rounded-lg p-3 text-center">
    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
    <p className={`text-sm md:text-base font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
  </div>
);

export default Users;
