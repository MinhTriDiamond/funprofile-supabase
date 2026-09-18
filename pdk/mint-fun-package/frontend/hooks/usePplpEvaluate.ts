import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/lib/logger';

export type PplpActionType = 'post' | 'comment' | 'reaction' | 'share' | 'friend' | 'livestream' | 'new_user_bonus';

interface PplpEvaluateParams {
  action_type: PplpActionType;
  reference_id?: string;
  content?: string;
  pplp_pillar?: 'inner_work' | null;
}

interface PplpEvaluateResult {
  success: boolean;
  light_action?: {
    id: string;
    action_type: string;
    light_score: number;
    is_eligible: boolean;
    mint_amount: number;
    evaluation: {
      quality: number;
      impact: number;
      integrity: number;
      unity: number;
      unity_multiplier: number;
      reasoning: string;
    };
  };
  error?: string;
}

/**
 * Hook to evaluate user actions via PPLP (Proof of Pure Love Protocol)
 * 
 * This hook provides a fire-and-forget evaluate function that:
 * - Calls the pplp-evaluate Edge Function asynchronously
 * - Does NOT block UI or wait for results
 * - Handles errors gracefully without disrupting user experience
 * - Logs results for debugging
 * 
 * Usage:
 * const { evaluate } = usePplpEvaluate();
 * evaluate({ action_type: 'post', reference_id: postId, content: postContent });
 */
export const usePplpEvaluate = () => {
  const evaluate = useCallback(async (params: PplpEvaluateParams): Promise<PplpEvaluateResult | null> => {
    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        logger.debug('[PPLP] No session, skipping evaluation');
        return null;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      logger.debug(`[PPLP] Evaluating action: ${params.action_type}`, {
        reference_id: params.reference_id,
        content_length: params.content?.length || 0,
      });

      const response = await fetch(`${supabaseUrl}/functions/v1/pplp-evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // 429 = daily limit reached, not an error
        if (response.status === 429) {
          logger.debug('[PPLP] Daily limit reached for', params.action_type, errorData);
          return { success: false, error: 'daily_limit' };
        }
        
        logger.error('[PPLP] Evaluation failed:', response.status, errorData);
        return { success: false, error: errorData.error || 'Unknown error' };
      }

      const result: PplpEvaluateResult = await response.json();
      
      logger.debug('[PPLP] Evaluation success:', {
        action_type: params.action_type,
        light_score: result.light_action?.light_score,
        is_eligible: result.light_action?.is_eligible,
        mint_amount: result.light_action?.mint_amount,
      });

      return result;
    } catch (error) {
      // Silent fail - don't disrupt user experience
      logger.error('[PPLP] Evaluation error:', error);
      return null;
    }
  }, []);

  /**
   * Fire-and-forget version - doesn't return result
   * Use this when you don't need to wait for the evaluation result
   */
  const evaluateAsync = useCallback((params: PplpEvaluateParams): void => {
    // Fire and forget - don't await
    evaluate(params).catch((err) => {
      logger.error('[PPLP] Async evaluation error:', err);
    });
  }, [evaluate]);

  return { 
    evaluate,      // Returns promise with result
    evaluateAsync  // Fire-and-forget, no return
  };
};
