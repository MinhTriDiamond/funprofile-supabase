import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Hook for community review with per-pillar scores
export function usePPLPv2CommunityReview() {
  const [isLoading, setIsLoading] = useState(false);

  const submitReview = useCallback(async (data: {
    action_id: string;
    review_type: string;
    endorse_score?: number;
    flag_score?: number;
    comment?: string;
    pillar_serving_life?: number;
    pillar_transparent_truth?: number;
    pillar_healing_love?: number;
    pillar_long_term_value?: number;
    pillar_unity_over_separation?: number;
  }) => {
    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('pplp-v2-community-review', {
        body: { action: 'submit_review', ...data },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success('Review đã được gửi!');
      return result;
    } catch (err: any) {
      toast.error(err.message || 'Không thể gửi review');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getReviews = useCallback(async (action_id: string) => {
    const { data: result, error } = await supabase.functions.invoke('pplp-v2-community-review', {
      body: { action: 'get_reviews', action_id },
    });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    return result.reviews || [];
  }, []);

  return { submitReview, getReviews, isLoading };
}
