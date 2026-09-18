// BTC history repair — đối chiếu donation BTC với on-chain, sửa hoặc xoá row sai.
// Idempotent. Admin-only (auth qua getClaims + has_role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchBtcResolverShadowLog } from "../_shared/btcResolverShadowLog.ts";
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MEMPOOL_API = "https://mempool.space/api";
const SAT = 100_000_000;

interface MempoolTx {
  txid: string;
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
  status: { confirmed: boolean; block_time?: number; block_height?: number };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchTx(txid: string): Promise<MempoolTx | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${MEMPOOL_API}/tx/${txid}`, { signal: AbortSignal.timeout(12_000) });
      if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(600); }
  }
  return null;
}

function lower(s: string | null | undefined) { return btcNormalizeAddress(s); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    // Admin auth — chấp nhận service role (gọi nội bộ) HOẶC user admin
    const auth = req.headers.get("Authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const isServiceRole = bearer && bearer === serviceKey;

    if (!isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(bearer);
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userId = claims.claims.sub;
      const adminCheck = createClient(supabaseUrl, serviceKey);
      const { data: roleRow } = await adminCheck.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let dryRun = true;
    let windowDays = 30;
    let onlyTxHash: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.dry_run === "boolean") dryRun = body.dry_run;
      if (typeof body?.window_days === "number" && body.window_days > 0 && body.window_days <= 365) windowDays = body.window_days;
      if (typeof body?.tx_hash === "string") onlyTxHash = body.tx_hash;
    } catch { /* default */ }

    const sinceIso = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

    // 1. Profiles map (btc primary + verified aux)
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name, btc_address")
      .not("btc_address", "is", null);
    const addrToProfile = new Map<string, { id: string; username: string; display_name: string | null }>();
    const userPrimaryBtc = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.btc_address) {
        addrToProfile.set(lower(p.btc_address), { id: p.id, username: p.username, display_name: p.display_name });
        userPrimaryBtc.set(p.id, lower(p.btc_address));
      }
    }
    const { data: auxRows } = await admin
      .from("profile_btc_aux_addresses")
      .select("user_id, address, verified")
      .eq("verified", true);
    const userAux = new Map<string, Set<string>>();
    for (const a of auxRows || []) {
      const addr = lower(a.address);
      if (!addr) continue;
      const owner = (profiles || []).find(p => p.id === a.user_id);
      if (owner && !addrToProfile.has(addr)) {
        addrToProfile.set(addr, { id: owner.id, username: owner.username, display_name: owner.display_name });
      }
      if (!userAux.has(a.user_id)) userAux.set(a.user_id, new Set());
      userAux.get(a.user_id)!.add(addr);
    }
    const userOwns = (uid: string, addr: string): boolean => {
      const a = lower(addr);
      return userPrimaryBtc.get(uid) === a || (userAux.get(uid)?.has(a) ?? false);
    };

    // 2. Fetch BTC donations in window
    let donQ = admin.from("donations")
      .select("id, tx_hash, sender_id, recipient_id, sender_address, recipient_address, amount, is_external, post_id, created_at, metadata")
      .eq("token_symbol", "BTC")
      .gte("created_at", sinceIso);
    if (onlyTxHash) donQ = donQ.eq("tx_hash", onlyTxHash);
    const { data: donations, error: donErr } = await donQ;
    if (donErr) throw new Error(`fetch donations: ${donErr.message}`);

    if (!donations || donations.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, message: "No BTC donations in window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Group by tx_hash, fetch on-chain once per tx
    const byTx = new Map<string, typeof donations>();
    for (const d of donations) {
      const arr = byTx.get(d.tx_hash) || [];
      arr.push(d);
      byTx.set(d.tx_hash, arr);
    }

    const stats = { scanned: donations.length, tx_fetched: 0, keep: 0, fixed_address: 0, reassigned: 0, marked_external: 0, deleted: 0, posts_deleted: 0, tx_rows_deleted: 0, tx_unreachable: 0 };
    const auditRows: Record<string, unknown>[] = [];

    for (const [txHash, rows] of byTx) {
      const tx = await fetchTx(txHash);
      stats.tx_fetched++;
      await sleep(150);
      if (!tx) {
        stats.tx_unreachable++;
        continue;
      }

      const vinAddrs = new Set<string>();
      for (const v of tx.vin) {
        const a = lower(v.prevout?.scriptpubkey_address);
        if (a) vinAddrs.add(a);
      }
      const outputs: Array<{ addr: string; sats: number }> = [];
      for (const v of tx.vout) {
        const a = lower(v.scriptpubkey_address);
        if (!a) continue;
        outputs.push({ addr: a, sats: v.value || 0 });
      }

      for (const d of rows) {
        const amtSat = Math.round(parseFloat(d.amount) * SAT);
        // Find output matching amount + recipient's actual btc_address
        const recipPrimary = userPrimaryBtc.get(d.recipient_id || "") || "";
        const recipAuxSet = userAux.get(d.recipient_id || "") || new Set<string>();
        const recipOwnedOutputs = outputs.filter(o => Math.abs(o.sats - amtSat) <= 1 && (o.addr === recipPrimary || recipAuxSet.has(o.addr)));

        const before = { ...d };

        // Shadow-log (Phase 2, chỉ quan sát): so sánh recipient_id hiện tại của donation
        // (đã ghi trước đó, có thể do scan-btc-transactions/cron gán) với resolver mới.
        const eventAtIso = tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : undefined;
        if (d.recipient_address) {
          dispatchBtcResolverShadowLog(admin, {
            address: d.recipient_address,
            rawAddressLegacySide: d.recipient_address,
            callSite: "btc-history-repair:recipient",
            legacyUserId: d.recipient_id ?? null,
            legacySource: "donations.recipient_id",
            idempotencyKey: `btc-history-repair:recipient:${txHash}:${d.id}`,
            createdBy: "btc-history-repair",
            eventAt: eventAtIso,
            txHash,
          });
        }
        if (d.sender_id && d.sender_address) {
          dispatchBtcResolverShadowLog(admin, {
            address: d.sender_address,
            rawAddressLegacySide: d.sender_address,
            callSite: "btc-history-repair:sender",
            legacyUserId: d.sender_id ?? null,
            legacySource: "donations.sender_id",
            idempotencyKey: `btc-history-repair:sender:${txHash}:${d.id}`,
            createdBy: "btc-history-repair",
            eventAt: eventAtIso,
            txHash,
          });
        }

        if (recipOwnedOutputs.length > 0) {
          // KEEP — set recipient_address if missing
          const desired = recipOwnedOutputs[0].addr;
          if (lower(d.recipient_address) !== desired) {
            if (!dryRun) {
              await admin.from("donations").update({ recipient_address: desired }).eq("id", d.id);
            }
            stats.fixed_address++;
            auditRows.push({ donation_id: d.id, tx_hash: txHash, action: "fix_recipient_address", reason: "set canonical recipient output", before, after: { recipient_address: desired } });
          } else {
            stats.keep++;
          }
          continue;
        }

        // Find any output matching amount where the address belongs to a known profile
        const candidate = outputs.find(o => Math.abs(o.sats - amtSat) <= 1 && addrToProfile.has(o.addr));
        if (candidate) {
          const newProfile = addrToProfile.get(candidate.addr)!;
          if (newProfile.id !== d.recipient_id) {
            // REASSIGN to correct recipient
            if (!dryRun) {
              await admin.from("donations").update({
                recipient_id: newProfile.id,
                recipient_address: candidate.addr,
              }).eq("id", d.id);
              // delete wrong gift_celebration post (its gift_recipient_id is the old wrong user)
              if (d.post_id) {
                await admin.from("posts").delete().eq("id", d.post_id);
                stats.posts_deleted++;
              }
              // delete wrong row in transactions for the wrong recipient
              if (d.recipient_id) {
                const { data: del } = await admin.from("transactions").delete().eq("tx_hash", txHash).eq("user_id", d.recipient_id).select("id");
                stats.tx_rows_deleted += (del || []).length;
              }
            }
            stats.reassigned++;
            auditRows.push({ donation_id: d.id, tx_hash: txHash, action: "reassign_recipient", reason: `output ${candidate.addr} (${amtSat} sat) belongs to ${newProfile.username}`, before, after: { recipient_id: newProfile.id, recipient_address: candidate.addr } });
            continue;
          }
        }

        // No matching output for this recipient/amount → bogus donation. Delete.
        if (!dryRun) {
          if (d.post_id) {
            await admin.from("posts").delete().eq("id", d.post_id);
            stats.posts_deleted++;
          }
          if (d.recipient_id) {
            const { data: del } = await admin.from("transactions").delete().eq("tx_hash", txHash).eq("user_id", d.recipient_id).select("id");
            stats.tx_rows_deleted += (del || []).length;
          }
          await admin.from("donations").delete().eq("id", d.id);
        }
        stats.deleted++;
        auditRows.push({ donation_id: d.id, tx_hash: txHash, action: "delete_bogus", reason: "no on-chain output matches recipient+amount", before, after: null });
      }

      // Sender validation pass — if a kept/fixed row has a sender_id, but no vin address belongs to that user, mark external
      for (const d of rows) {
        if (!d.sender_id) continue;
        const hasSenderInput = Array.from(vinAddrs).some(a => userOwns(d.sender_id!, a));
        if (!hasSenderInput) {
          if (!dryRun) {
            await admin.from("donations").update({
              sender_id: null,
              is_external: true,
              metadata: { ...(d.metadata as object || {}), reverted_sender: true, reverted_reason: "sender vin not owned" },
            }).eq("id", d.id);
            if (d.post_id) {
              await admin.from("posts").delete().eq("id", d.post_id);
              stats.posts_deleted++;
            }
            // remove sender-side transactions row
            await admin.from("transactions").delete().eq("tx_hash", txHash).eq("user_id", d.sender_id);
          }
          stats.marked_external++;
          auditRows.push({ donation_id: d.id, tx_hash: txHash, action: "mark_external_sender", reason: "no input owned by claimed sender", before: { sender_id: d.sender_id }, after: { sender_id: null, is_external: true } });
        }
      }
    }

    // Write audit (in chunks)
    if (auditRows.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < auditRows.length; i += CHUNK) {
        await admin.from("btc_history_repair_audit_20260612").insert(auditRows.slice(i, i + CHUNK));
      }
    }

    return new Response(JSON.stringify({ dry_run: dryRun, window_days: windowDays, stats, audit_rows: auditRows.length }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("btc-history-repair error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
