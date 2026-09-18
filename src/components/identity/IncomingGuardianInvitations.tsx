import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Inbox, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';
import { usePendingGuardianInvitations } from '@/hooks/useGuardians';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface InviterInfo {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function IncomingGuardianInvitations() {
  const { userId } = useCurrentUser();
  const { data: did } = useDID();
  const { data: invites = [], refetch, isLoading } = usePendingGuardianInvitations();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [inviters, setInviters] = useState<Record<string, InviterInfo>>({});

  // Resolve thông tin người mời (A) từ did_id → owner_user_id → profile
  useEffect(() => {
    (async () => {
      const missing = (invites as any[])
        .map((inv) => inv?.did_registry?.owner_user_id)
        .filter((uid: string | undefined): uid is string => !!uid && !inviters[uid]);
      if (missing.length === 0) return;
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', Array.from(new Set(missing)));
      if (data) {
        setInviters((prev) => {
          const next = { ...prev };
          for (const p of data) {
            next[p.id] = {
              user_id: p.id,
              display_name: p.display_name,
              username: p.username,
              avatar_url: p.avatar_url,
            };
          }
          return next;
        });
      }
    })();
  }, [invites]);

  const respond = async (
    inv: any,
    action: 'accept' | 'decline',
  ) => {
    setSubmittingId(inv.id);
    try {
      const newStatus = action === 'accept' ? 'active' : 'declined';
      const patch: any = { status: newStatus };
      if (action === 'accept') patch.accepted_at = new Date().toISOString();
      else patch.revoked_at = new Date().toISOString();

      const { error } = await (supabase as any)
        .from('identity_guardians')
        .update(patch)
        .eq('id', inv.id);
      if (error) throw error;

      const inviterOwner = inv?.did_registry?.owner_user_id;

      // Log identity event + notify A
      if (action === 'accept') {
        await (supabase as any).from('identity_events').insert({
          did_id: inv.did_id,
          event_type: 'guardian_accepted',
          event_ref: inv.id,
          source: did?.did_id ?? 'guardian',
          tc_delta: 0.03,
          metadata: { guardian_did_id: did?.did_id, relationship: inv.relationship },
        });
      }

      if (inviterOwner && userId && inviterOwner !== userId) {
        try {
          await (supabase as any).from('notifications').insert({
            user_id: inviterOwner,
            actor_id: userId,
            type: action === 'accept' ? 'guardian_accepted' : 'guardian_declined',
            read: false,
            metadata: {
              guardian_id: inv.id,
              did_id: inv.did_id,
              guardian_did_id: did?.did_id,
            },
          });
        } catch (e) {
          console.warn('[IncomingGuardian] notify fail', e);
        }
      }

      // Recalc TC cho A nếu accept (fire-and-forget)
      if (action === 'accept' && inv.did_id) {
        supabase.functions
          .invoke('identity-trust-engine', { body: { did_id: inv.did_id } })
          .catch(() => {});
      }

      toast.success(action === 'accept' ? 'Đã chấp nhận lời mời' : 'Đã từ chối lời mời');
      refetch();
    } catch (e: any) {
      toast.error('Thao tác lỗi', { description: e.message });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Card id="incoming-invites" className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="w-4 h-4 text-primary" />
          Lời mời Guardian dành cho bạn
          {invites.length > 0 && (
            <Badge variant="default" className="ml-1">{invites.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : invites.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Hiện chưa có ai mời bạn làm guardian.
          </p>
        ) : (
          invites.map((inv: any) => {
            const inviterUid = inv?.did_registry?.owner_user_id;
            const p = inviterUid ? inviters[inviterUid] : undefined;
            const displayName =
              p?.display_name ?? p?.username ?? 'Người dùng FUN';
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={p?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {displayName} mời bạn làm guardian
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {inv.did_id}
                  </p>
                  <div className="flex gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {inv.relationship}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      pending
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submittingId === inv.id}
                    onClick={() => respond(inv, 'decline')}
                    className="h-8 px-2"
                  >
                    {submittingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-destructive" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    disabled={submittingId === inv.id}
                    onClick={() => respond(inv, 'accept')}
                    className="h-8 px-3"
                  >
                    {submittingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Chấp nhận
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
