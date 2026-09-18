/**
 * SR-2: Gift Dialog — Recipient Search Hook
 * Extracted from UnifiedGiftSendDialog to eliminate God Component.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import logger from '@/lib/logger';
import type { ResolvedRecipient } from './types';

function resolveWalletAddress(profile: Record<string, unknown>): string | null {
  return (profile.public_wallet_address || profile.external_wallet_address || profile.wallet_address) as string | null;
}

function mapProfileToRecipient(p: Record<string, unknown>): ResolvedRecipient {
  return {
    id: p.id as string,
    username: p.username as string,
    displayName: (p.display_name as string) || null,
    avatarUrl: p.avatar_url as string | null,
    walletAddress: resolveWalletAddress(p),
    btcAddress: (p.btc_address as string) || null,
    hasVerifiedWallet: !!(p.public_wallet_address || p.external_wallet_address),
  };
}

interface UseRecipientSearchParams {
  isOpen: boolean;
  isPresetMode: boolean;
  senderUserId: string | null;
}

export function useRecipientSearch({ isOpen, isPresetMode, senderUserId }: UseRecipientSearchParams) {
  const [searchTab, setSearchTab] = useState<'username' | 'address' | 'bulk'>('username');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ResolvedRecipient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [resolvedRecipients, setResolvedRecipients] = useState<ResolvedRecipient[]>([]);

  const debouncedQuery = useDebounce(searchQuery, 300);

  const performSearch = useCallback(async (query: string, tab: 'username' | 'address') => {
    if (!query.trim()) { setSearchResults([]); setSearchError(''); return; }
    setIsSearching(true);
    setSearchError('');
    try {
      const selectFields = 'id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address, btc_address';
      if (tab === 'username') {
        const cleanQuery = query.replace(/^@/, '').toLowerCase().trim();
        if (cleanQuery.length < 2) { setSearchResults([]); setIsSearching(false); return; }
        const { data, error } = await supabase
          .from('profiles')
          .select(selectFields)
          .or(`username_normalized.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`)
          .limit(20);
        if (error) throw error;
        if (data && data.length > 0) {
          setSearchResults(data.map((p) => mapProfileToRecipient(p as unknown as Record<string, unknown>)));
        } else {
          setSearchResults([]);
          setSearchError('Không tìm thấy người dùng');
        }
      } else {
        const addr = query.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
          setSearchResults([]);
          if (addr.length > 3) setSearchError('Địa chỉ ví không hợp lệ');
          setIsSearching(false);
          return;
        }
        const { data, error } = await supabase
          .from('profiles')
          .select(selectFields)
          .or(`wallet_address.ilike.${addr},public_wallet_address.ilike.${addr},external_wallet_address.ilike.${addr}`)
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          setSearchResults(data.map((p) => mapProfileToRecipient(p as unknown as Record<string, unknown>)));
        } else {
          setSearchResults([]);
          setSearchError('Không tìm thấy FUN username cho địa chỉ này.');
        }
      }
    } catch (err) {
      logger.error('[GIFT] Search error:', err);
      setSearchError('Lỗi khi tìm kiếm');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || isPresetMode) return;
    if (searchTab === 'bulk') { setSearchResults([]); setSearchError(''); return; }
    performSearch(debouncedQuery, searchTab);
  }, [debouncedQuery, searchTab, isOpen, isPresetMode, performSearch]);

  const handleSelectRecipient = useCallback((recipient: ResolvedRecipient) => {
    if (resolvedRecipients.some(r => r.id === recipient.id)) {
      toast.info(`@${recipient.username} đã được chọn rồi`);
      return;
    }
    if (recipient.id === senderUserId) {
      toast.error('Không thể tặng quà cho chính mình');
      return;
    }
    setResolvedRecipients(prev => [...prev, recipient]);
    setSearchQuery('');
    setSearchResults([]);
  }, [resolvedRecipients, senderUserId]);

  const handleRemoveRecipient = useCallback((recipientId: string) => {
    setResolvedRecipients(prev => prev.filter(r => r.id !== recipientId));
  }, []);

  const handleBulkAdd = useCallback((recipients: ResolvedRecipient[]) => {
    if (recipients.length === 0) return;
    setResolvedRecipients(prev => {
      const existingIds = new Set(prev.map(r => r.id));
      const toAdd = recipients.filter(r => !existingIds.has(r.id) && r.id !== senderUserId);
      if (toAdd.length === 0) {
        toast.info('Tất cả người nhận đã có trong danh sách');
        return prev;
      }
      toast.success(`Đã thêm ${toAdd.length} người nhận`);
      return [...prev, ...toAdd];
    });
  }, [senderUserId]);

  const handleClearAll = useCallback(() => {
    setResolvedRecipients([]);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
  }, []);

  const handleChangeTab = useCallback((tab: 'username' | 'address' | 'bulk') => {
    setSearchTab(tab);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
  }, []);

  const resetSearch = useCallback(() => {
    setSearchTab('username');
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setResolvedRecipients([]);
  }, []);

  return {
    searchTab,
    searchQuery,
    searchResults,
    isSearching,
    searchError,
    resolvedRecipients,
    setSearchQuery,
    handleChangeTab,
    handleSelectRecipient,
    handleRemoveRecipient,
    handleBulkAdd,
    handleClearAll,
    resetSearch,
  };
}
