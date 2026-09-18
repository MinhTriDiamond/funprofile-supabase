import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PPLPv2Action {
  id: string;
  action_type_code: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface PPLPv2ValidationResult {
  success: boolean;
  action_id: string;
  validation_status: string;
  engine_version?: string;
  // v2.0 pillars
  pplp_v2_pillars?: {
    repentance: number;
    gratitude: number;
    service_pillar: number;
    help_pillar: number;
    giving_pillar: number;
  };
  nlp_features?: {
    ego_signal: number;
    authenticity: number;
    love_tone: number;
    depth_score: number;
    intent_score: number;
  };
  // Legacy pillars (backward compat)
  pillars?: {
    serving_life: number;
    transparent_truth: number;
    healing_love: number;
    long_term_value: number;
    unity_over_separation: number;
  };
  raw_light_score: number;
  final_light_score: number;
  dimensions?: {
    intent: number;
    depth: number;
    impact: number;
    consistency: number;
    trust_factor: number;
  };
  fraud_risk?: string;
  fraud_score?: number;
  multipliers?: {
    impact: number;
    trust: number;
    consistency: number;
  };
  mint: {
    mint_amount_user: number;
    mint_amount_platform: number;
  } | null;
  reasoning: string;
  flags: string[];
}

export function usePPLPv2() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [validationResult, setValidationResult] = useState<PPLPv2ValidationResult | null>(null);

  const submitAction = useCallback(async (data: {
    action_type_code: string;
    title: string;
    description?: string;
    source_url?: string;
  }) => {
    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('pplp-v2-submit-action', {
        body: data,
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    } catch (err: any) {
      toast.error(err.message || 'Không thể gửi hành động');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const attachProof = useCallback(async (data: {
    action_id: string;
    proof_type?: string;
    proof_url?: string;
    extracted_text?: string;
  }) => {
    setIsAttaching(true);
    setValidationResult(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('pplp-v2-attach-proof', {
        body: data,
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      
      // If validation was auto-triggered
      if (result?.validation) {
        setValidationResult(result.validation);
      }
      return result;
    } catch (err: any) {
      toast.error(err.message || 'Không thể đính kèm bằng chứng');
      throw err;
    } finally {
      setIsAttaching(false);
    }
  }, []);

  const fetchMyActions = useCallback(async () => {
    const { data, error } = await supabase
      .from('pplp_v2_user_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }, []);

  const fetchValidation = useCallback(async (actionId: string) => {
    const { data, error } = await supabase
      .from('pplp_v2_validations')
      .select('*')
      .eq('action_id', actionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, []);

  const fetchMintRecord = useCallback(async (actionId: string) => {
    const { data, error } = await supabase
      .from('pplp_v2_mint_records')
      .select('*')
      .eq('action_id', actionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, []);

  return {
    submitAction,
    attachProof,
    fetchMyActions,
    fetchValidation,
    fetchMintRecord,
    isSubmitting,
    isAttaching,
    validationResult,
    setValidationResult,
  };
}
