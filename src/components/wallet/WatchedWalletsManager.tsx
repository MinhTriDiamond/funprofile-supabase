import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWatchedWallets } from '@/hooks/useWatchedWallets';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WatchedWalletsManager({ open, onOpenChange }: Props) {
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const { data: wallets, isLoading } = useWatchedWallets();
  const qc = useQueryClient();
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState<'bsc' | 'btc'>('bsc');
  const [label, setLabel] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error(t('vupNotLoggedIn'));
      const trimmed = address.trim();
      if (!trimmed) throw new Error(t('wwmEnterAddress'));
      const normalized = chain === 'bsc' ? trimmed.toLowerCase() : trimmed;
      if (chain === 'bsc' && !/^0x[0-9a-f]{40}$/.test(normalized)) {
        throw new Error(t('wwmInvalidEvm'));
      }
      if (chain === 'btc' && (normalized.length < 26 || normalized.length > 90)) {
        throw new Error(t('wwmInvalidBtc'));
      }
      const { error } = await supabase.from('user_watched_wallets').insert({
        user_id: userId,
        address: normalized,
        chain,
        label: label.trim() || t('wwmDefaultLabel'),
        enabled: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t('wwmAdded'));
      setAddress('');
      setLabel('');
      qc.invalidateQueries({ queryKey: ['watched-wallets'] });
      qc.invalidateQueries({ queryKey: ['external-wallet-activity'] });
    },
    onError: (e: any) => toast.error(e?.message || t('wwmAddFailed')),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_watched_wallets').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t('wwmRemoved'));
      qc.invalidateQueries({ queryKey: ['watched-wallets'] });
      qc.invalidateQueries({ queryKey: ['external-wallet-activity'] });
    },
    onError: (e: any) => toast.error(e?.message || t('wwmRemoveFailed')),
  });

  const userAdded = (wallets || []).filter((w) => w.source === 'user_added');
  const systemLinked = (wallets || []).filter((w) => w.source !== 'user_added');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('wwmTitle')}</DialogTitle>
          <DialogDescription>
            {t('wwmDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs font-semibold">{t('wwmAddNew')}</Label>
            <div className="flex gap-2">
              <Select value={chain} onValueChange={(v) => setChain(v as 'bsc' | 'btc')}>
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bsc">BSC</SelectItem>
                  <SelectItem value="btc">BTC</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={chain === 'bsc' ? '0x...' : 'bc1... / 1... / 3...'}
                className="flex-1 h-9 font-mono text-xs"
              />
            </div>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('wwmLabelPlaceholder')}
              className="h-9 text-sm"
              maxLength={50}
            />
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !address.trim()}
              size="sm"
              className="w-full gap-1"
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('wwmAddToList')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t('reelFollowing')}</Label>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">{t('fcdLoading')}</p>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {systemLinked.map((w) => (
                  <div
                    key={`sys:${w.chain}:${w.address}`}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {w.chain.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium truncate">{w.label}</span>
                        <Badge variant="secondary" className="text-[9px]">
                          {t('notTabSystem')}
                        </Badge>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {w.address}
                      </div>
                    </div>
                  </div>
                ))}

                {userAdded.length === 0 && systemLinked.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t('wwmEmpty')}
                  </p>
                )}

                {userAdded.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {w.chain.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium truncate">{w.label}</span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {w.address}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => w.id && removeMutation.mutate(w.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
