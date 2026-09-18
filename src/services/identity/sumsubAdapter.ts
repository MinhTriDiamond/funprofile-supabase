import { supabase } from "@/integrations/supabase/client";
import type {
  AccessTokenResult,
  CreateApplicantResult,
  IdentityProvider,
  IdentityVerification,
  KycAccessState,
} from "./identityVerificationTypes";

async function invoke<T>(fn: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body: {} });
  if (error) {
    // edge function returned non-2xx; surface message from data when available
    const msg = (data as any)?.message || (data as any)?.error || error.message;
    throw new Error(msg);
  }
  return data as T;
}

export const sumsubAdapter: IdentityProvider = {
  name: "sumsub",
  async createApplicant(): Promise<CreateApplicantResult> {
    return invoke<CreateApplicantResult>("sumsub-create-applicant");
  },
  async getAccessToken(): Promise<AccessTokenResult> {
    return invoke<AccessTokenResult>("sumsub-get-access-token");
  },
  async getStatus() {
    return invoke<{
      verification: IdentityVerification | null;
      isTest: boolean;
      frozen: boolean;
    }>("sumsub-get-status");
  },
  async getAccessState(): Promise<KycAccessState> {
    return invoke<KycAccessState>("kyc-access-check");
  },
};
