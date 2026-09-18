import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Search, Wallet } from 'lucide-react';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import { ExportTransactionsMenu } from '@/components/wallet/ExportTransactionsMenu';
import { mapClaimsToRows } from '@/utils/export';


interface ClaimHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClaimRecord {
  id: string;
  user_id: string | null;
  amount: number;
  wallet_address: string;
  created_at: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_external: boolean;
  email?: string | null;
}

export const ClaimHistoryModal = ({ open, onOpenChange }: ClaimHistoryModalProps) => {
  const { t, language } = useLanguage();
  const { userId } = useCurrentUser();
  const [search, setSearch] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      return !!data;
    },
    enabled: open && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: emailsMap } = useQuery({
    queryKey: ['admin-emails-for-claims'],
    queryFn: async () => {
      if (!userId) return new Map<string, string>();
      const { data } = await supabase.rpc('get_user_emails_for_admin', { p_admin_id: userId });
      if (!data) return new Map<string, string>();
      return new Map((data as Array<{ user_id: string; email: string }>).map(e => [e.user_id, e.email]));
    },
    enabled: open && !!isAdmin && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: claims, isLoading } = useQuery({
    queryKey: ['claim-history-all'],
    queryFn: async (): Promise<ClaimRecord[]> => {
      const { data, error } = await supabase.rpc('get_all_claim_history');
      if (error) throw error;

      return (data || []).map((d: any) => {
        const isExternal = !d.user_id;
        return {
          id: d.id,
          user_id: d.user_id,
          amount: d.amount,
          wallet_address: d.wallet_address,
          created_at: d.created_at,
          username: d.username || (isExternal ? (language === 'vi' ? 'V� ngo�i hệ thống' : 'External Wallet') : 'unknown'),
          full_name: d.full_name || null,
          avatar_url: d.avatar_url || null,
          is_external: isExternal,
        };
      });
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const enrichedClaims = useMemo(() => {
    if (!claims) return [];
    if (!isAdmin || !emailsMap) return claims;
    return claims.map(c => ({
      ...c,
      email: c.user_id ? (emailsMap.get(c.user_id) || null) : null,
    }));
  }, [claims, isAdmin, emailsMap]);

  const filtered = useMemo(() => {
    if (!enrichedClaims.length) return [];
    if (!search.trim()) return enrichedClaims;
    const q = search.toLowerCase();
    return enrichedClaims.filter(c =>
      c.username.toLowerCase().includes(q) ||
      (c.full_name && c.full_name.toLowerCase().includes(q)) ||
      c.wallet_address.toLowerCase().includes(q) ||
      (isAdmin && c.email && c.email.toLowerCase().includes(q))
    );
  }, [enrichedClaims, search, isAdmin]);

  const totalAmount = useMemo(() => {
    return filtered.reduce((sum, c) => sum + c.amount, 0);
  }, [filtered]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatAmount = (n: number) => n.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  const truncateWallet = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleUserClick = (c: ClaimRecord) => {
    if (!c.is_external && c.username && c.username !== 'unknown') {
      window.open(`/profile/${c.username}`, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:!max-w-[1050px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center uppercase bg-gradient-to-r from-[#1B5E20] via-[#2E7D32] to-[#1B5E20] bg-clip-text text-transparent drop-shadow-md">
            DANH SÁCH USER ĐÃ ĐẾN NHẬN PHƯỚC LÀNH TỪ CHA VÀ BÉ LY
          </DialogTitle>
        </DialogHeader>

        {/* Search + Export */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('searchClaim')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ExportTransactionsMenu
            getRows={() => mapClaimsToRows(filtered)}
            meta={{
              title: 'Lịch sử nhận phước lành CAMLY',
              userDisplayName: 'FUN Profile (Cha & Bé Ly)',
              dateRangeLabel: 'Toàn bộ',
              isOwner: !!isAdmin,
              surface: 'claim_history',
              filterParams: { search, total_amount: totalAmount },
            }}
            filenameBase="fun-profile-claim-history"
            currentUserId={userId}
            isAdminRole={!!isAdmin}
          />
        </div>


        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border" ref={tableRef}>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{t('noClaimHistory')}</div>
          ) : (
            <table className="w-full text-sm table-auto">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-1.5">{isAdmin ? 'Email' : t('user')}</th>
                  <th className="text-left px-2 py-1.5">{t('claimFullName')}</th>
                  <th className="text-left px-2 py-1.5">{t('claimWalletAddress')}</th>
                  <th className="text-right px-2 py-1.5">{t('claimAmount')}</th>
                  <th className="text-right px-2 py-1.5">{t('claimDate')}</th>
                  <th className="text-right px-2 py-1.5">{t('claimTime')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30 transition-colors align-top">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {isAdmin ? (
                        <span className="text-muted-foreground">{c.email || c.username}</span>
                      ) : (
                        <div
                          className={`flex items-center gap-2 ${!c.is_external ? 'cursor-pointer group' : ''}`}
                          onClick={() => handleUserClick(c)}
                        >
                          <Avatar className="w-6 h-6 shrink-0">
                            {c.is_external ? (
                              <AvatarFallback className="text-[10px] bg-accent"><Wallet className="w-3 h-3" /></AvatarFallback>
                            ) : (
                              <>
                                <AvatarImage src={c.avatar_url || undefined} />
                                <AvatarFallback className="text-[10px] bg-primary/10">{c.username[0]?.toUpperCase()}</AvatarFallback>
                              </>
                            )}
                          </Avatar>
                          <span className={`font-medium whitespace-nowrap ${c.is_external ? 'italic text-muted-foreground' : 'group-hover:underline group-hover:text-[#2E7D32]'}`}>
                            {c.username}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{c.full_name || '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{truncateWallet(c.wallet_address)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#FFD700] whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1">
                        {formatAmount(c.amount)}
                        <img src={camlyLogo} alt="CAMLY" className="w-4 h-4 inline-block shrink-0" />
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">{formatDate(c.created_at)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">{formatTime(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="text-lg font-bold text-center pt-1 flex items-center justify-center gap-2">
          <span>{filtered.length} {language === 'vi' ? 'bản ghi' : 'records'}</span>
          <span>|</span>
          <span className="flex items-center gap-1 text-[#1B5E20]">
            {language === 'vi' ? 'Tổng' : 'Total'}: {formatAmount(totalAmount)}
            <img src={camlyLogo} alt="CAMLY" className="w-5 h-5 inline-block" />
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
