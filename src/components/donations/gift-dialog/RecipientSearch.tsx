/**
 * SR-2: Gift Dialog — Recipient Search Component
 */

import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Search, Shield, User, Wallet, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import type { ResolvedRecipient } from './types';
import { BulkRecipientInput } from './BulkRecipientInput';
import { BulkRecipientPreview } from './BulkRecipientPreview';

interface RecipientSearchProps {
  resolvedRecipients: ResolvedRecipient[];
  senderUserId: string | null;
  onSelectRecipient: (recipient: ResolvedRecipient) => void;
  onRemoveRecipient: (id: string) => void;
  onClearAll: () => void;
  onBulkAdd?: (recipients: ResolvedRecipient[], amounts: Record<string, string>) => void;
}

function resolveWalletAddress(profile: Record<string, unknown>): string | null {
  return (profile.public_wallet_address || profile.external_wallet_address || profile.wallet_address) as string | null;
}

export function RecipientSearch({
  resolvedRecipients,
  senderUserId,
  onSelectRecipient,
  onRemoveRecipient,
  onClearAll,
  onBulkAdd,
}: RecipientSearchProps) {
  const [searchTab, setSearchTab] = useState<'username' | 'address' | 'bulk'>('username');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ResolvedRecipient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  const performSearch = useCallback(async (query: string, tab: 'username' | 'address' | 'bulk') => {
    if (tab === 'bulk') { setSearchResults([]); setSearchError(''); return; }
    if (!query.trim()) { setSearchResults([]); setSearchError(''); return; }
    setIsSearching(true);
    setSearchError('');
    try {
      const selectFields = 'id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address';
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
          setSearchResults(data.map((p) => ({
            id: p.id,
            username: p.username,
            displayName: p.display_name || null,
            avatarUrl: p.avatar_url,
            walletAddress: resolveWalletAddress(p as Record<string, unknown>),
            hasVerifiedWallet: !!(p.public_wallet_address || (p as Record<string, unknown>).external_wallet_address),
          })));
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
          setSearchResults(data.map((p) => ({
            id: p.id,
            username: p.username,
            displayName: p.display_name || null,
            avatarUrl: p.avatar_url,
            walletAddress: resolveWalletAddress(p as Record<string, unknown>),
            hasVerifiedWallet: !!(p.public_wallet_address || (p as Record<string, unknown>).external_wallet_address),
          })));
        } else {
          setSearchResults([]);
          setSearchError('Không tìm thấy FUN username cho địa chỉ này.');
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchError('Lỗi khi tìm kiếm');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery, searchTab);
  }, [debouncedQuery, searchTab, performSearch]);

  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-2 block">
        Người nhận {resolvedRecipients.length > 0 && <span className="text-primary">({resolvedRecipients.length} đã chọn)</span>}:
      </label>

      {/* Preview danh sách người nhận đã chọn */}
      {resolvedRecipients.length > 0 && (
        <div className="mb-3">
          <BulkRecipientPreview
            recipients={resolvedRecipients}
            senderUserId={senderUserId}
            onRemove={onRemoveRecipient}
            onClearAll={resolvedRecipients.length > 1 ? onClearAll : undefined}
          />
        </div>
      )}


      {/* Search tabs + input */}
      <div className="space-y-2">
        <Tabs
          value={searchTab}
          onValueChange={(v) => {
            setSearchTab(v as 'username' | 'address' | 'bulk');
            setSearchQuery('');
            setSearchResults([]);
            setSearchError('');
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="username" className="flex-1 text-xs gap-1">
              <User className="w-3.5 h-3.5" />Username
            </TabsTrigger>
            <TabsTrigger value="address" className="flex-1 text-xs gap-1">
              <Wallet className="w-3.5 h-3.5" />Địa chỉ ví
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1 text-xs gap-1">
              <Users className="w-3.5 h-3.5" />Hàng loạt
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {searchTab === 'bulk' ? (
          onBulkAdd ? (
            <BulkRecipientInput
              senderUserId={senderUserId}
              existingRecipients={resolvedRecipients}
              onAdd={onBulkAdd}
            />
          ) : (
            <div className="text-xs text-muted-foreground p-3 rounded-lg border bg-muted/30">
              Chức năng thêm hàng loạt chưa khả dụng trong ngữ cảnh này.
            </div>
          )
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchTab === 'username' ? '@username... (chọn nhiều người)' : '0x...'}
              className={`pl-9 text-sm ${searchTab === 'address' ? 'font-mono' : ''}`}
            />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        )}

        {/* Results dropdown */}
        {searchResults.length > 0 && (
          <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
            {searchResults
              .filter((result) => !resolvedRecipients.some((r) => r.id === result.id) && result.id !== senderUserId)
              .map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    onSelectRecipient(result);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 hover:bg-accent transition-colors text-left"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={result.avatarUrl || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">{result.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-medium text-sm truncate">{result.displayName || result.username}</p>
                      {result.hasVerifiedWallet && <Shield className="w-3 h-3 text-emerald-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">@{result.username}</p>
                    {result.walletAddress && (
                      <p className="text-[10px] text-muted-foreground/70 font-mono truncate">
                        {result.walletAddress.slice(0, 6)}...{result.walletAddress.slice(-4)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
          </div>
        )}

        {searchError && !isSearching && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{searchError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
