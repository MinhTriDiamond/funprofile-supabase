/**
 * Typed helpers for Supabase Json columns.
 *
 * Problem: Supabase types `metadata`, `social_links`, etc. as `Json`
 * which is `string | number | boolean | null | { [key: string]: Json } | Json[]`.
 * Typed objects cannot be directly assigned to `Json` without casting.
 *
 * Solution: Centralized cast functions to use at insertion/read boundaries
 * instead of casting the entire supabase client as `any`.
 *
 * Usage:
 *   import { toJson, fromJson } from '@/utils/supabaseJsonHelpers';
 *   // Writing: .update({ metadata: toJson({ live_status: 'live' }) })
 *   // Reading: const meta = fromJson<LivePostMetadata>(row.metadata);
 */

import type { Json } from '@/integrations/supabase/types';

/**
 * Cast a typed object to Supabase Json for INSERT/UPDATE operations.
 * This is a compile-time cast — no runtime transformation.
 */
export function toJson<T extends Record<string, unknown>>(obj: T): Json {
  return obj as unknown as Json;
}

/**
 * Cast a Supabase Json value back to a typed object for reads.
 * Returns `null` if the input is null/undefined.
 */
export function fromJson<T>(json: Json | null | undefined): T | null {
  if (json === null || json === undefined) return null;
  return json as unknown as T;
}

/**
 * Merge a partial typed object into an existing Json column value.
 * Useful for metadata columns where you only want to update some keys.
 */
export function mergeJson<T extends Record<string, unknown>>(
  existing: Json | null | undefined,
  patch: Partial<T>
): Json {
  const base = (existing && typeof existing === 'object' && !Array.isArray(existing))
    ? existing
    : {};
  return { ...base, ...patch } as unknown as Json;
}
