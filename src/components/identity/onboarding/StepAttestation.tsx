import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Award, Loader2, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';
import { useGuardianSearch, GuardianCandidate } from '@/hooks/useGuardianSearch';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function StepAttestation({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { userId } = useCurrentUser();
  const { data: did } = useDID();
  const [query, setQuery] = useState('');
  const [sentToDids, setSentToDids] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const { data: results = [], isFetching } = useGuardianSearch(query, userId ?? undefined);

  // Khôi phục danh sách đã gửi từ DB (24h gần nhất) sau reload
  useEffect(() => {
    if (!did?.did_id) return;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from('attestation_log')
        .select('to_did')
        .eq('from_did', did.did_id)
        .eq('status', 'active')
        .gte('created_at', since);
      if (data) setSentToDids(new Set(data.map((r: any) => r.to_did)));
    })();
  }, [did?.did_id]);

  const sendAttestation = async (cand: GuardianCandidate) => {
    if (!did?.did_id || !cand.did_id) {
      toast.error('Người này chưa có DID');
      return;
    }
    setSending(cand.user_id);
    try {
      const { error } = await supabase.functions.invoke('identity-attestation-submit', {
        body: {
          from_did: did.did_id,
          to_did: cand.did_id,
          attestation_type: 'peer_endorsement',
          weight: 0.5,
        },
      });
      if (error) throw error;
      setSentToDids((s) => new Set(s).add(cand.did_id!));
      toast.success(`Đã gửi attestation cho ${cand.display_name ?? cand.email}`);
    } catch (e: any) {
      toast.error('Không gửi được', { description: e.message });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Award className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Trao Peer Attestation</h3>
              <p className="text-xs text-muted-foreground">
                Xác nhận uy tín cho người bạn tin tưởng — củng cố mạng lưới Trust.
              </p>
            </div>
            <Badge variant="outline" className="font-mono">{sentToDids.size} đã gửi</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo email, tên hoặc DID"
          className="pl-9"
        />
      </div>

      {query.length >= 2 && (
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {isFetching ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Không tìm thấy</p>
          ) : results.map((r) => {
            const already = sentToDids.has(r.did_id ?? "");
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
                <Button
                  size="sm"
                  variant={already ? 'ghost' : 'default'}
                  disabled={already || sending === r.user_id || !r.did_id}
                  onClick={() => sendAttestation(r)}
                  className="h-7 text-xs"
                >
                  {sending === r.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   already ? '✓ Đã gửi' :
                   !r.did_id ? 'Chưa có DID' :
                   <><Send className="w-3 h-3 mr-1" />Gửi</>}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">Quay lại</Button>
        <Button onClick={onNext} className="flex-1">
          {sentToDids.size > 0 ? 'Tiếp tục' : 'Bỏ qua'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        Attestation là tự nguyện. Bạn có thể trao bất cứ lúc nào trong Identity Dashboard.
      </p>
    </div>
  );
}
