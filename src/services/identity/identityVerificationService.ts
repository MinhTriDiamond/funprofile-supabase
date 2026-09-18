import { sumsubAdapter } from "./sumsubAdapter";
import type { IdentityProvider } from "./identityVerificationTypes";

// Factory: chooses adapter. Future: switch to fun-core when ready.
export function getIdentityProvider(): IdentityProvider {
  return sumsubAdapter;
}

export const identityVerificationService = {
  createApplicant: () => getIdentityProvider().createApplicant(),
  getAccessToken: () => getIdentityProvider().getAccessToken(),
  getStatus: () => getIdentityProvider().getStatus(),
  getAccessState: () => getIdentityProvider().getAccessState(),
};
