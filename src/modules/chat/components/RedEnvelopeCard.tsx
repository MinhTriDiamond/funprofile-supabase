import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RedEnvelope, RedEnvelopeClaim } from '../types';
import { RedEnvelopeClaimDialog } from './RedEnvelopeClaimDialog';

interface RedEnvelopeCardProps {
  envelopeId: string;
  userId: string | null;
}

export function RedEnvelopeCard({ envelopeId, userId }: RedEnvelopeCardProps) {
  const [showClaim, setShowClaim] = useState(false);
  const queryClient = useQueryClient();

  const { data: envelope, isLoading } = useQuery({
    queryKey: ['chat-red-envelope', envelopeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('red_envelopes')
        .select('*')
        .eq('id', envelopeId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RedEnvelope | null;
    },
    enabled: !!envelopeId,
    staleTime: 5000,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('claim_red_envelope', { p_envelope_id: envelopeId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-red-envelope', envelopeId] });
    },
  });

  if (isLoading || !envelope) {
    return <div className="w-48 h-24 rounded-xl bg-destructive/20 animate-pulse" />;
  }

  const isExpired = envelope.status === 'expired' || new Date(envelope.expires_at) < new Date();
  const isFullyClaimed = envelope.remaining_count <= 0;
  const statusText = isExpired ? 'Đã hết hạn' : isFullyClaimed ? 'Đã hết' : `Còn ${envelope.remaining_count} lì xì`;

  return (
    <>
      <button
        onClick={() => !isExpired && !isFullyClaimed && setShowClaim(true)}
        disabled={isExpired || isFullyClaimed}
        className="w-48 rounded-xl bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground p-4 text-left hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <div className="text-lg mb-1">🧧</div>
        <div className="text-sm font-medium">{envelope.total_amount} {envelope.token}</div>
        <div className="text-xs opacity-80 mt-1">{statusText}</div>
      </button>

      <RedEnvelopeClaimDialog
        open={showClaim}
        onOpenChange={setShowClaim}
        envelope={envelope}
        userId={userId}
        onClaim={async () => {
          await claimMutation.mutateAsync();
          setShowClaim(false);
        }}
      />
    </>
  );
}
