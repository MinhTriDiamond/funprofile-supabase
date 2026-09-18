import { useQuery } from "@tanstack/react-query";
import { identityVerificationService } from "@/services/identity/identityVerificationService";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useKycAccess() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ["kyc-access", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => identityVerificationService.getAccessState(),
  });
}

export function useIdentityVerification(opts?: { pollMs?: number }) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ["identity-verification", userId],
    enabled: !!userId,
    refetchInterval: opts?.pollMs,
    queryFn: () => identityVerificationService.getStatus(),
  });
}
