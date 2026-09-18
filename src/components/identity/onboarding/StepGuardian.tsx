import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, Shield, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';
import { useMyGuardians } from '@/hooks/useGuardians';
import { useGuardianSearch, GuardianCandidate } from '@/hooks/useGuardianSearch';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const MIN_GUARDIANS = 2;

export function StepGuardian({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { userId } = useCurrentUser();
  const { data: did } = useDID();
  const { data: guardians = [], refetch } = useMyGuardians();
  const [query, setQuery] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { data: results = [], isFetching } = useGuardianSearch(query, userId ?? undefined);

  const activeOrPending = guardians.filter((g: any) => g.status !== 'revoked');
  const inviteIds = new Set(activeOrPending.map((g: any) => g.guardian_did_id));

  const invite = async (cand: GuardianCandidate) => {
    if (!did?.did_id || !cand.did_id) {
      toast.error('Người này chưa có DID — chưa thể mời làm guardian');
      return;
    }
    setSubmittingId(cand.user_id);
    try {
      // Kiểm tra row hiện hữu để tránh dính UNIQUE (did_id, guardian_did_id)
      const { data: existing } = await (supabase as any)
        .from('identity_guardians')
        .select('id, status')
        .eq('did_id', did.did_id)
        .eq('guardian_did_id', cand.did_id)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending' || existing.status === 'active') {
          toast.info('Bạn đã mời người này rồi');
          return;
        }
        // revoked / declined → re-activate về pending
        const { error: updErr } = await (supabase as any)
          .from('identity_guardians')
          .update({
            status: 'pending',
            relationship: 'friend',
            invited_at: new Date().toISOString(),
            accepted_at: null,
            revoked_at: null,
          })
          .eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        const { error } = await (supabase as any).from('identity_guardians').insert({
          did_id: did.did_id,
          guardian_did_id: cand.did_id,
          relationship: 'friend',
          status: 'pending',
        });
        if (error) throw error;
      }

      // Notification
      try {
        await (supabase as any).from('notifications').insert({
          user_id: cand.user_id,
          actor_id: userId,
          type: 'guardian_invited',
          read: false,
          metadata: {
            did_id: did.did_id,
            guardian_did_id: cand.did_id,
            guardian_relationship: 'friend',
          },
        });
      } catch (e) {
        console.warn('[StepGuardian] notify fail', e);
      }

      toast.success(`Đã mời ${cand.display_name ?? cand.email ?? 'guardian'}`);
      refetch();
      setQuery('');
    } catch (e: any) {
      toast.error('Không thể mời', { description: e.message });
    } finally {
      setSubmittingId(null);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await (supabase as any)
      .from('identity_guardians')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Đã gỡ'); refetch(); }
  };

  const canProceed = activeOrPending.length >= MIN_GUARDIANS;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Mời Trusted Guardians</h3>
              <p className="text-xs text-muted-foreground">
                Mời tối thiểu {MIN_GUARDIANS} người tin cậy để bật khôi phục tài khoản.
              </p>
            </div>
            <Badge variant="outline" className="font-mono">
              {activeOrPending.length}/{MIN_GUARDIANS}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Email, tên hoặc did:fun:..."
          className="pl-9"
        />
      </div>

      {query.length >= 2 && (
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {isFetching ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Không tìm thấy người dùng</p>
          ) : results.map((r) => {
            const already = r.did_id ? inviteIds.has(r.did_id) : false;
            return (
              <div key={r.user_id} className="flex items-center gap-2 rounded-lg border p-2.5">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{(r.display_name ?? r.email ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.display_name ?? r.username ?? 'Ẩn danh'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email ?? r.did_id ?? '—'}</p>
                </div>
                {r.did_level && <Badge variant="outline" className="text-[10px] h-5">{r.did_level}</Badge>}
                <Button
                  size="sm"
                  variant={already ? 'ghost' : 'default'}
                  disabled={already || submittingId === r.user_id || !r.did_id}
                  onClick={() => invite(r)}
                  className="h-7 text-xs"
                >
                  {submittingId === r.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   already ? 'Đã mời' :
                   !r.did_id ? 'Chưa có DID' :
                   <><UserPlus className="w-3 h-3 mr-1" />Mời</>}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {activeOrPending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Guardians đã mời</p>
          {activeOrPending.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono truncate">{g.guardian_did_id}</p>
                <div className="flex gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">{g.relationship}</Badge>
                  <Badge variant={g.status === 'active' ? 'default' : 'outline'} className="text-[9px] h-4 px-1.5">
                    {g.status}
                  </Badge>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => revoke(g.id)} className="h-7 w-7">
                <X className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">Quay lại</Button>
        <Button onClick={onNext} disabled={!canProceed} className="flex-1">
          {canProceed ? 'Tiếp tục' : `Cần thêm ${MIN_GUARDIANS - activeOrPending.length} guardian`}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        Bạn có thể bỏ qua và thêm guardian sau trong Identity → Recovery.
      </p>
      <button onClick={onNext} className="w-full text-xs text-muted-foreground underline">
        Bỏ qua bước này
      </button>
    </div>
  );
}
