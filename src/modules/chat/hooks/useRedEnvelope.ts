
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RedEnvelope, RedEnvelopeClaim } from '../types';

export function useRedEnvelope(envelopeId: string | null, conversationId: string | null) {
  const queryClient = useQueryClient();

  const envelopeQuery = useQuery({
    queryKey: ['chat-red-envelope', envelopeId],
    queryFn: async () => {
      if (!envelopeId) return null as RedEnvelope | null;
      const { data, error } = await supabase
        .from('red_envelopes')
        .select('*')
        .eq('id', envelopeId)
        .maybeSingle();
      if (error) throw error;
      return data as any as RedEnvelope | null;
    },
    enabled: !!envelopeId,
    staleTime: 5 * 1000,
  });

  const claimsQuery = useQuery({
    queryKey: ['chat-red-envelope-claims', envelopeId],
    queryFn: async () => {
      if (!envelopeId) return [] as RedEnvelopeClaim[];
      const { data, error } = await supabase
        .from('red_envelope_claims')
        .select('*')
        .eq('envelope_id', envelopeId)
        .order('claimed_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any as RedEnvelopeClaim[];
    },
    enabled: !!envelopeId,
    staleTime: 5 * 1000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`red-envelope:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'red_envelopes', filter: `conversation_id=eq.${conversationId}` },
        () => {
          if (envelopeId) queryClient.invalidateQueries({ queryKey: ['chat-red-envelope', envelopeId] });
        }
      )
      .on(
        'postgres_changes',
        envelopeId
          ? { event: '*', schema: 'public', table: 'red_envelope_claims', filter: `envelope_id=eq.${envelopeId}` }
          : { event: '*', schema: 'public', table: 'red_envelope_claims' },
        () => {
          if (envelopeId) queryClient.invalidateQueries({ queryKey: ['chat-red-envelope-claims', envelopeId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, envelopeId, queryClient]);

  const claim = useMutation({
    mutationFn: async () => {
      if (!envelopeId) throw new Error('Missing envelope');
      const { data, error } = await supabase.rpc('claim_red_envelope', { p_envelope_id: envelopeId });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      if (envelopeId) {
        queryClient.invalidateQueries({ queryKey: ['chat-red-envelope', envelopeId] });
        queryClient.invalidateQueries({ queryKey: ['chat-red-envelope-claims', envelopeId] });
      }
    },
  });

  return {
    envelope: envelopeQuery.data || null,
    claims: claimsQuery.data || [],
    isLoading: envelopeQuery.isLoading || claimsQuery.isLoading,
    claim,
  };
}
