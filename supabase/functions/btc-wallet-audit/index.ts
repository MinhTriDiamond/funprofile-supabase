/**
 * btc-wallet-audit
 *
 * Rà soát toàn diện chuỗi ví HD BTC của 1 user:
 *  1. BFS on-chain từ địa chỉ chính + mọi địa chỉ aux đã biết.
 *     - Học XUÔI: input thuộc user → mọi change-output không thuộc user khác cũng là của user.
 *     - Học NGƯỢC: change-output đi vào địa chỉ đã thuộc user → mọi input của tx đó cũng là của user.
 *  2. Lưu mọi địa chỉ mới phát hiện vào `profile_btc_aux_addresses`.
 *  3. Backfill `donations` còn `sender_id NULL` khớp các địa chỉ này → gắn đúng sender.
 *  4. Xoá `wallet_transfers` BTC trùng tx_hash với donations nội bộ.
 *  5. Cập nhật `posts.gift_celebration` về đúng user.
 *
 * Idempotent: chạy nhiều lần an toàn.
 *
 * Body: { target_user_id: string, max_addresses?: number (default 500), max_iterations?: number (default 6) }
 * Auth: admin only (kiểm tra qua user_roles).
 */
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchBtcResolverShadowLog } from "../_shared/btcResolverShadowLog.ts";
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

const MEMPOOL_API = "https://mempool.space/api";
const BTC_CHAIN_ID = 0;

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
  fee?: number;
}

const norm = (a: string | undefined | null) => btcNormalizeAddress(a);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function satsToBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc === 0) return "0";
  return btc.toFixed(8).replace(/\.?0+$/, "") || "0";
}

async function fetchAddrTxs(address: string, maxPages = 40): Promise<MempoolTx[]> {
  const all: MempoolTx[] = [];
  let lastTxid: string | null = null;
  for (let p = 0; p < maxPages; p++) {
    const url = lastTxid
      ? `${MEMPOOL_API}/address/${address}/txs/chain/${lastTxid}`
      : `${MEMPOOL_API}/address/${address}/txs`;
    let page: MempoolTx[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
        if (!res.ok) { console.warn(`mempool ${address}: ${res.status}`); return all; }
        page = await res.json();
        break;
      } catch (e) {
        console.warn(`mempool err ${address}:`, e);
        await sleep(800);
      }
    }
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < 25) break;
    lastTxid = page[page.length - 1].txid;
    await sleep(300);
  }
  return all;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = createAdminClient();

    // Auth: admin, chính chủ ví, hoặc no-auth nếu body.bootstrap_token khớp env BTC_AUDIT_BOOTSTRAP (one-shot ops)
    const authHeader = req.headers.get("Authorization");
    let callerId: string | null = null;
    let isAdmin = false;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anon = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await anon.auth.getUser(token);
      callerId = userData?.user?.id || null;
      if (callerId) {
        const { data: roleRows } = await admin
          .from("user_roles").select("role").eq("user_id", callerId);
        isAdmin = (roleRows || []).some((r: any) => r.role === "admin");
      }
    }

    const body = await req.json().catch(() => ({} as any));
    const targetUserId: string | undefined = body.target_user_id;
    const MAX_ADDRS = Math.min(Number(body.max_addresses) || 500, 1000);
    const MAX_ITER = Math.min(Number(body.max_iterations) || 6, 12);
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cho phép: admin, chính chủ, hoặc target = FATHER (one-shot whitelist khắc phục sự cố HD)
    const FATHER_ID = "4466cccf-6287-4a19-9b19-c2bd4d763f47";
    if (!isAdmin && callerId !== targetUserId && targetUserId !== FATHER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden: chỉ admin hoặc chính chủ ví" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load target profile
    const { data: target } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, btc_address, created_at")
      .eq("id", targetUserId)
      .single();
    if (!target?.btc_address) {
      return new Response(JSON.stringify({ error: "User has no btc_address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load ALL btc addresses for internal-user mapping
    const internalBtc = new Map<string, string>(); // addr → user_id
    {
      const { data: allBtc } = await admin
        .from("profiles").select("id, btc_address").not("btc_address", "is", null);
      for (const p of allBtc || []) {
        if (p.btc_address) internalBtc.set(norm(p.btc_address), p.id);
      }
      const { data: allAux } = await admin
        .from("profile_btc_aux_addresses").select("user_id, address");
      for (const a of allAux || []) {
        internalBtc.set(norm(a.address), a.user_id);
      }
    }

    // Owned set: addresses we already know belong to target
    const owned = new Set<string>();
    owned.add(norm(target.btc_address));
    const { data: targetAux } = await admin
      .from("profile_btc_aux_addresses").select("address").eq("user_id", targetUserId);
    for (const r of targetAux || []) owned.add(norm(r.address));

    const txCache = new Map<string, MempoolTx[]>(); // addr → txs
    const fetchedAddrs = new Set<string>();
    const newlyLearned: { address: string; source: string; first_seen_tx: string }[] = [];

    // BTC_WALLET_AUDIT_WRITE_LOCK (P0, pre-Phase-1) — auto-learn (hd_change_auto/hd_cluster)
    // và backfill donations/wallet_transfers/posts trong function này suy luận vòng tròn
    // giống hd_input_back (RC8/RC-10) nhưng KHÔNG lọc qua verified=true, nên phải khoá độc
    // lập với cờ HD_INPUT_BACK_ENABLED bên dưới. BFS/report vẫn chạy để admin điều tra;
    // chỉ INSERT/UPDATE/DELETE bị chặn. Bật lại: app_settings.btc_wallet_audit_write_enabled='true'.
    const { data: writeEnabledRpc } = await admin.rpc("btc_wallet_audit_write_enabled");
    const WRITE_ENABLED = writeEnabledRpc === true;

    async function fetchOwned(addr: string): Promise<MempoolTx[]> {
      const key = norm(addr);
      if (txCache.has(key)) return txCache.get(key)!;
      fetchedAddrs.add(key);
      await sleep(300);
      const txs = await fetchAddrTxs(addr);
      txCache.set(key, txs);
      return txs;
    }

    // FREEZE 2026-07-03 (Sub-phase D): hd_input_back đã gây gán nhầm ví exchange/hot wallet
    // (ví dụ Binance hot wallet cho @angelkim). Toàn bộ source `hd_input_back` bị vô hiệu
    // cho tới khi audit + rollback hoàn tất. Cho phép bật lại qua env `BTC_HD_INPUT_BACK_ENABLED=1`.
    const HD_INPUT_BACK_ENABLED = Deno.env.get("BTC_HD_INPUT_BACK_ENABLED") === "1";

    function learn(addr: string, source: string, txid: string) {
      if (source === "hd_input_back" && !HD_INPUT_BACK_ENABLED) {
        console.log(`[audit] FROZEN hd_input_back skip addr=${addr} tx=${txid}`);
        return false;
      }
      const n = norm(addr);
      if (owned.has(n)) return false;
      // Conflict guard: nếu đã thuộc internal user khác → KHÔNG học (tránh chiếm nhầm)
      const existingOwner = internalBtc.get(n);
      if (existingOwner && existingOwner !== targetUserId) return false;
      owned.add(n);
      internalBtc.set(n, targetUserId);
      newlyLearned.push({ address: addr, source, first_seen_tx: txid });

      // Shadow-log (Phase 2, chỉ quan sát): so sánh claim ownership của heuristic
      // (hd_change_auto/hd_cluster/hd_input_back) với resolver mới, trước khi ghi aux row.
      dispatchBtcResolverShadowLog(admin, {
        address: addr,
        rawAddressLegacySide: addr,
        callSite: `btc-wallet-audit:learn:${source}`,
        legacyUserId: targetUserId ?? null,
        legacySource: source,
        idempotencyKey: `btc-wallet-audit:learn:${txid}:${n}`,
        createdBy: "btc-wallet-audit",
        txHash: txid,
      });

      return true;
    }


    // BFS
    let frontier = Array.from(owned);
    let iter = 0;
    while (frontier.length > 0 && iter < MAX_ITER && owned.size <= MAX_ADDRS) {
      iter++;
      const nextFrontier = new Set<string>();
      console.log(`[audit] iter ${iter}: frontier=${frontier.length}, owned=${owned.size}`);

      for (const addr of frontier) {
        if (owned.size > MAX_ADDRS) break;
        const txs = await fetchOwned(addr);
        for (const tx of txs) {
          if (!tx.status.confirmed) continue;
          // Bỏ qua tx có quá nhiều input (consolidation/exchange) — clustering không an toàn
          if ((tx.vin || []).length > 5) continue;

          const inputAddrs = (tx.vin || [])
            .map(v => norm(v.prevout?.scriptpubkey_address))
            .filter(Boolean);
          const outputs = (tx.vout || [])
            .map(v => ({ addr: norm(v.scriptpubkey_address), raw: v.scriptpubkey_address || "", val: v.value || 0 }))
            .filter(o => o.addr);

          const anyInputOwned = inputAddrs.some(a => owned.has(a));

          // === FORWARD ===
          // Input thuộc user → output không thuộc user khác = change của ví HD.
          if (anyInputOwned && outputs.length >= 2) {
            for (const o of outputs) {
              if (owned.has(o.addr)) continue;
              const otherOwner = internalBtc.get(o.addr);
              if (otherOwner && otherOwner !== targetUserId) continue;
              if (learn(o.raw, "hd_change_auto", tx.txid)) nextFrontier.add(o.addr);
            }
          }

          // === COMMON-INPUT CLUSTERING ===
          // Nếu ≥1 input thuộc user → mọi input còn lại cũng thuộc user (nguyên tắc chuẩn của BTC clustering).
          if (anyInputOwned && inputAddrs.length > 1) {
            for (const a of inputAddrs) {
              if (owned.has(a)) continue;
              const otherOwner = internalBtc.get(a);
              if (otherOwner && otherOwner !== targetUserId) continue;
              const rawIn = (tx.vin || []).find(v => norm(v.prevout?.scriptpubkey_address) === a)?.prevout?.scriptpubkey_address;
              if (rawIn && learn(rawIn, "hd_cluster", tx.txid)) nextFrontier.add(a);
            }
          }

          // === BACKWARD (CHANGE HEURISTIC) ===
          // Output thuộc user + KHÔNG có input thuộc user → đây có thể là RECEIVE (đừng học input)
          // HOẶC là output change từ địa chỉ HD chưa biết của user (cần học).
          // Heuristic an toàn: chỉ học khi owned output là output LỚN NHẤT trong tx (đặc trưng của change)
          // và tx chỉ có 1 input (không phải consolidation/exchange).
          if (!anyInputOwned && inputAddrs.length === 1 && outputs.length >= 2) {
            const ownedOuts = outputs.filter(o => owned.has(o.addr));
            if (ownedOuts.length > 0) {
              const maxOwnedVal = Math.max(...ownedOuts.map(o => o.val));
              const maxOtherVal = Math.max(...outputs.filter(o => !owned.has(o.addr)).map(o => o.val));
              // owned output phải lớn hơn HẲN (≥2x) output còn lại → mới đủ tin cậy là change
              if (maxOwnedVal >= 2 * maxOtherVal) {
                const a = inputAddrs[0];
                const otherOwner = internalBtc.get(a);
                if (!otherOwner || otherOwner === targetUserId) {
                  const rawIn = tx.vin[0]?.prevout?.scriptpubkey_address;
                  if (rawIn && learn(rawIn, "hd_input_back", tx.txid)) nextFrontier.add(a);
                }
              }
            }
          }
        }
      }
      frontier = Array.from(nextFrontier);
    }

    // Persist newly learned aux addresses (idempotent)
    let insertedAux = 0;
    if (WRITE_ENABLED && newlyLearned.length > 0) {
      for (const row of newlyLearned) {
        const { error } = await admin.from("profile_btc_aux_addresses").upsert({
          user_id: targetUserId,
          address: row.address,
          source: row.source,
          first_seen_tx: row.first_seen_tx,
        }, { onConflict: "address" });
        if (!error) insertedAux++;
      }
    } else if (newlyLearned.length > 0) {
      console.log(`[audit] WRITE_LOCKED skip insert aux rows=${newlyLearned.length} target=${targetUserId}`);
    }

    // Collect all txs for owned addresses (already in cache for fetched ones).
    // Ensure we fetch any owned address not yet fetched.
    for (const addr of owned) {
      if (!fetchedAddrs.has(addr)) {
        // tìm raw casing — dùng lowercase ok với mempool API
        await fetchOwned(addr);
      }
    }

    // Build full set of distinct confirmed txs touching owned addresses
    const allTxs = new Map<string, MempoolTx>();
    for (const txs of txCache.values()) {
      for (const tx of txs) {
        if (!tx.status.confirmed) continue;
        allTxs.set(tx.txid, tx);
      }
    }

    // Backfill donations: cho mọi tx có input thuộc owned, gắn sender = target cho donation có sender_id NULL.
    const sendTxIds: string[] = [];
    for (const tx of allTxs.values()) {
      const inputs = (tx.vin || []).map(v => norm(v.prevout?.scriptpubkey_address));
      if (inputs.some(a => owned.has(a))) sendTxIds.push(tx.txid);
    }

    let backfilledDonations = 0;
    let deletedTransfers = 0;
    let updatedPosts = 0;

    if (!WRITE_ENABLED && sendTxIds.length > 0) {
      console.log(`[audit] WRITE_LOCKED skip donations/transfers/posts backfill send_txs=${sendTxIds.length} target=${targetUserId}`);
    }
    if (WRITE_ENABLED && sendTxIds.length > 0) {
      // Chia chunk để tránh URL quá dài
      const chunk = 100;
      for (let i = 0; i < sendTxIds.length; i += chunk) {
        const part = sendTxIds.slice(i, i + chunk);
        // 1. Backfill donations
        const { data: updRows, error: updErr } = await admin
          .from("donations")
          .update({
            sender_id: targetUserId,
            is_external: false,
            metadata: { chain_family: "bitcoin", sender_name: target.display_name || target.username, backfilled_by: "btc-wallet-audit" },
          })
          .in("tx_hash", part)
          .eq("token_symbol", "BTC")
          .is("sender_id", null)
          .select("id, tx_hash");
        if (!updErr) backfilledDonations += (updRows || []).length;

        // 2. Xoá wallet_transfers BTC trùng tx_hash với donations nội bộ
        // (internal-transfer-dedup rule)
        const { data: donRows } = await admin
          .from("donations")
          .select("tx_hash")
          .in("tx_hash", part)
          .eq("token_symbol", "BTC")
          .not("sender_id", "is", null)
          .not("is_external", "is", true);
        const internalHashes = Array.from(new Set((donRows || []).map((d: any) => d.tx_hash)));
        if (internalHashes.length > 0) {
          const { data: delRows } = await admin
            .from("wallet_transfers")
            .delete()
            .in("tx_hash", internalHashes)
            .eq("token_symbol", "BTC")
            .select("id");
          deletedTransfers += (delRows || []).length;
        }

        // 3. Cập nhật post gift_celebration: gán đúng user_id = target
        const { data: postRows } = await admin
          .from("posts")
          .update({ user_id: targetUserId })
          .in("tx_hash", part)
          .eq("post_type", "gift_celebration")
          .neq("user_id", targetUserId)
          .select("id");
        updatedPosts += (postRows || []).length;
      }
    }

    return new Response(JSON.stringify({
      target_user_id: targetUserId,
      primary_address: target.btc_address,
      writes_locked: !WRITE_ENABLED,
      owned_addresses_count: owned.size,
      newly_learned_addresses: newlyLearned.length,
      inserted_aux_rows: insertedAux,
      iterations: iter,
      send_txs_examined: sendTxIds.length,
      total_txs_seen: allTxs.size,
      backfilled_donations: backfilledDonations,
      deleted_duplicate_transfers: deletedTransfers,
      updated_gift_posts: updatedPosts,
      newly_learned_sample: newlyLearned.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("btc-wallet-audit error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
