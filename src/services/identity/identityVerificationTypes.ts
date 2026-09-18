// Types compatible with future FUN Core API.
export type IdentityVerificationStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "expired";

export type VerificationEnvironment = "sandbox" | "production";

export interface IdentityVerification {
  id: string;
  status: IdentityVerificationStatus;
  level_name: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
  is_test_verification: boolean;
  verification_environment: VerificationEnvironment;
  provider_applicant_id: string | null;
  updated_at: string;
}

export interface KycAccessState {
  ctaVisible: boolean;
  reason: string | null;
  message: string | null;
  isTest: boolean;
  frozen: boolean;
}

export interface CreateApplicantResult {
  applicantId: string;
  status: IdentityVerificationStatus;
  reused: boolean;
  isTest: boolean;
  environment: VerificationEnvironment;
}

export interface AccessTokenResult {
  token: string;
  userId: string;
  ttl: number;
  levelName: string;
  isTest: boolean;
}

export interface IdentityProvider {
  readonly name: "sumsub";
  createApplicant(): Promise<CreateApplicantResult>;
  getAccessToken(): Promise<AccessTokenResult>;
  getStatus(): Promise<{
    verification: IdentityVerification | null;
    isTest: boolean;
    frozen: boolean;
  }>;
  getAccessState(): Promise<KycAccessState>;
}
