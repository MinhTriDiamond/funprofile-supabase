import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMyGuardians } from '@/hooks/useGuardians';
import { useDID } from '@/hooks/useDID';

export function GuardianManager() {
  const { data: did } = useDID();
  const { data: guardians = [], refetch } = useMyGuardians();
  const [guardianDid, setGuardianDid] = useState('');
  const [relationship, setRelationship] = useState('friend');
  const [submitting, setSubmitting] = useState(false);

  const invite = async () => {
    if (!did?.did_id || !guardianDid.trim()) return;
    setSubmitting(true);
    try {
      const trimmed = guardianDid.trim();
      const { error } = await (supabase as any).from('identity_guardians').insert({
        did_id: did.did_id,
        guardian_did_id: trimmed,
        relationship,
        status: 'pending',
      });
      if (error) throw error;

      // Notify guardian — resolve owner_user_id từ did_id
      try {
        const { data: gOwner } = await (supabase as any)
          .from('did_registry')
          .select('owner_user_id')
          .eq('did_id', trimmed)
          .maybeSingle();
        const { data: { user } } = await supabase.auth.getUser();
        if (gOwner?.owner_user_id && user?.id && gOwner.owner_user_id !== user.id) {
          await (supabase as any).from('notifications').insert({
            user_id: gOwner.owner_user_id,
            actor_id: user.id,
            type: 'guardian_invited',
            read: false,
            metadata: {
              did_id: did.did_id,
              guardian_did_id: trimmed,
              guardian_relationship: relationship,
            },
          });
        }
      } catch (notifErr) {
        console.warn('[GuardianManager] notification failed:', notifErr);
      }

      toast.success('Đã gửi lời mời guardian');
      setGuardianDid('');
      refetch();
    } catch (e: any) {
      toast.error('Lỗi mời', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await (supabase as any).from('identity_guardians')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Đã thu hồi'); refetch(); }
  };

  const activeCount = guardians.filter((g: any) => g.status === 'active').length;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-4 h-4 text-primary" />
          Trusted Guardians ({activeCount}/5)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="DID của guardian (did:fun:...)"
            value={guardianDid}
            onChange={(e) => setGuardianDid(e.target.value)}
            className="text-xs font-mono"
          />
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="px-2 rounded border bg-background text-xs"
          >
            <option value="friend">Bạn</option>
            <option value="family">Gia đình</option>
            <option value="mentor">Mentor</option>
            <option value="colleague">Đồng nghiệp</option>
          </select>
          <Button size="sm" onClick={invite} disabled={submitting || activeCount >= 5}>
            <UserPlus className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="space-y-1.5">
          {guardians.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Chưa có guardian. Mời 2-3 người đáng tin để bật recovery.</p>
          ) : guardians.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono truncate">{g.guardian_did_id}</p>
                <div className="flex gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">{g.relationship}</Badge>
                  <Badge variant={g.status === 'active' ? 'default' : 'outline'} className="text-[9px] h-4 px-1.5">{g.status}</Badge>
                </div>
              </div>
              {g.status !== 'revoked' && (
                <Button size="sm" variant="ghost" onClick={() => revoke(g.id)} className="h-7 w-7 p-0">
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
