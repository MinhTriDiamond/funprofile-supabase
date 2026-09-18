import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminKycItem {
  id: string;
  user_id: string;
  provider: string;
  provider_applicant_id: string | null;
  status: string;
  level_name: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
  is_test_verification: boolean;
  verification_environment: 'sandbox' | 'production';
  updated_at: string;
  created_at: string;
  // Phase B Hardening
  actual_document_type: string | null;
  actual_issuing_country: string | null;
  selected_document_type: string | null;
  selected_country: string | null;
  doc_mismatch: boolean;
  kyc_risk_flag: string | null;
  email: string | null;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    identity_verified: boolean;
    identity_is_test: boolean;
    identity_level: string | null;
  } | null;
}

export interface AdminKycListResponse {
  items: AdminKycItem[];
  total: number;
  page: number;
  page_size: number;
  summary: Record<string, number>;
}

export interface AdminKycFilters {
  status?: string;
  environment?: 'sandbox' | 'production';
  is_test?: boolean;
  mismatch_only?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}

export function useAdminKycList(filters: AdminKycFilters, enabled = true) {
  return useQuery<AdminKycListResponse>({
    queryKey: ['admin-kyc-list', filters],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-kyc-list', {
        body: { mode: 'list', ...filters },
      });
      if (error) throw error;
      return data as AdminKycListResponse;
    },
  });
}

export function useAdminKycDetail(verificationId?: string, userId?: string) {
  return useQuery({
    queryKey: ['admin-kyc-detail', verificationId],
    enabled: !!verificationId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-kyc-list', {
        body: { mode: 'detail', verification_id: verificationId, user_id: userId },
      });
      if (error) throw error;
      return data as {
        verification: any;
        events: any[];
        audits: any[];
      };
    },
  });
}
