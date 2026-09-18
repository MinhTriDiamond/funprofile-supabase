/**
 * txBeacon — Sampling perf beacon cho Unified Transaction History.
 *
 * Sử dụng:
 *   const stop = txBeacon.start('wallet_history', 'list_first_page');
 *   ... await fetch ...
 *   stop({ payload_bytes: bytes });
 *
 * - Sampling 10% mặc định (override qua window.__TX_BEACON_SAMPLE__).
 * - Không throw, không retry, không chặn UI.
 */
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_SAMPLE = 0.1;

function sampleRate() {
  const w = typeof window !== 'undefined' ? (window as unknown as { __TX_BEACON_SAMPLE__?: number }) : null;
  const v = w?.__TX_BEACON_SAMPLE__;
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : DEFAULT_SAMPLE;
}

function shouldSample() {
  return Math.random() < sampleRate();
}

async function send(surface: string, op: string, ms: number, payload_bytes?: number, meta?: Record<string, unknown>) {
  try {
    await supabase.functions.invoke('tx-perf-beacon', {
      body: { surface, op, ms, payload_bytes, meta },
    });
  } catch {
    /* fire-and-forget */
  }
}

export const txBeacon = {
  start(surface: string, op: string) {
    if (typeof performance === 'undefined' || !shouldSample()) {
      return (_: { payload_bytes?: number; meta?: Record<string, unknown> } = {}) => {};
    }
    const t0 = performance.now();
    return ({ payload_bytes, meta }: { payload_bytes?: number; meta?: Record<string, unknown> } = {}) => {
      const ms = Math.round(performance.now() - t0);
      void send(surface, op, ms, payload_bytes, meta);
    };
  },
};
