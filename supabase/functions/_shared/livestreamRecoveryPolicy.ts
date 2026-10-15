export type LivestreamOrphanClass = 'recoverable' | 'retryable' | 'terminal' | 'ambiguous';

export function classifyLivestreamOrphan(input: {
  providerHandle?: boolean;
  providerQuery?: 'active' | 'pending' | 'temporary_error' | 'unknown' | 'terminal';
  providerQuerySucceeded?: boolean;
  mediaObjectChecked?: boolean;
  mediaObjectVerified?: boolean;
}): LivestreamOrphanClass {
  if (input.mediaObjectVerified) return 'recoverable';
  if (input.providerQuerySucceeded && input.providerQuery === 'terminal' && input.mediaObjectChecked) return 'terminal';
  if (input.providerHandle && ['active', 'pending', 'temporary_error'].includes(input.providerQuery || '')) return 'retryable';
  return 'ambiguous';
}
