// Auto cron: backfill thiếu dòng `transactions` từ `donations` (sender + recipient)
// và tạo `gift_celebration` post bị thiếu. Idempotent qua NOT EXISTS (tx_hash, user_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    let windowDays = 30;
    try {
      const body = await req.json();
      if (typeof body?.window_days === "number" && body.window_days > 0 && body.window_days <= 90) {
        windowDays = body.window_days;
      }
    } catch { /* default */ }


    const sinceIso = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

    // 1. Fetch donations confirmed trong cửa sổ
    const allDonations: any[] = [];
    {
      let offset = 0; const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("donations")
          .select("id, sender_id, recipient_id, tx_hash, amount, token_symbol, token_address, chain_id, message, created_at, post_id, sender_address, recipient_address, is_external")
          .eq("status", "confirmed")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error(`fetch donations: ${error.message}`);
        if (!data?.length) break;
        allDonations.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
    }

    if (allDonations.length === 0) {
      return new Response(JSON.stringify({ donations_scanned: 0, tx_rows_inserted: 0, posts_created: 0, window_days: windowDays }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fetch profiles relevant
    const userIds = Array.from(new Set(
      allDonations.flatMap(d => [d.sender_id, d.recipient_id]).filter(Boolean)
    ));
    const profileMap = new Map<string, any>();
    {
      const CHUNK = 200;
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const batch = userIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address, btc_address")
          .in("id", batch);
        if (error) throw new Error(`fetch profiles: ${error.message}`);
        for (const p of data || []) profileMap.set(p.id, p);
      }
    }

    // 3. Existing (tx_hash,user_id) trong transactions
    const txHashes = Array.from(new Set(allDonations.map(d => d.tx_hash).filter(Boolean)));
    const existingTxKey = new Set<string>();
    {
      const CHUNK = 200;
      for (let i = 0; i < txHashes.length; i += CHUNK) {
        const batch = txHashes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("transactions")
          .select("tx_hash, user_id")
          .in("tx_hash", batch);
        if (error) throw new Error(`fetch transactions: ${error.message}`);
        for (const t of data || []) existingTxKey.add(`${t.tx_hash}|${t.user_id}`);
      }
    }

    // 4. Existing gift_celebration posts
    const existingPostTx = new Set<string>();
    {
      const CHUNK = 200;
      for (let i = 0; i < txHashes.length; i += CHUNK) {
        const batch = txHashes.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("posts")
          .select("tx_hash")
          .eq("post_type", "gift_celebration")
          .in("tx_hash", batch);
        for (const p of data || []) if (p.tx_hash) existingPostTx.add(p.tx_hash);
      }
    }

    // 5. Build tx rows to insert (sender + recipient)
    const txRows: any[] = [];
    const postRows: any[] = [];
    const addrOfEvm = (p: any) =>
      p?.wallet_address || p?.public_wallet_address || p?.external_wallet_address || "";
    const addrOfBtc = (p: any) => p?.btc_address || "";

    for (const d of allDonations) {
      if (!d.tx_hash || !d.recipient_id) continue;
      const recipient = profileMap.get(d.recipient_id);
      if (!recipient) continue;
      const sender = d.sender_id ? profileMap.get(d.sender_id) : null;

      const isBtc = (d.token_symbol || "").toUpperCase() === "BTC";
      const fromAddr = isBtc
        ? (d.sender_address || addrOfBtc(sender))
        : (d.sender_address || addrOfEvm(sender));
      const toAddr = isBtc
        ? (d.recipient_address || addrOfBtc(recipient))
        : (d.recipient_address || addrOfEvm(recipient));
      // Bỏ qua nếu thiếu địa chỉ phía nhận (không có gì để hiển thị)
      if (!toAddr) continue;

      const base = {
        tx_hash: d.tx_hash,
        from_address: fromAddr || "",
        to_address: toAddr,
        amount: String(d.amount ?? ""),
        token_symbol: d.token_symbol,
        token_address: d.token_address || null,
        chain_id: isBtc ? 0 : (d.chain_id || 56),
        status: "confirmed",
        created_at: d.created_at,
      };

      // Sender-side (chỉ khi nội bộ)
      if (d.sender_id && sender) {
        const senderKey = `${d.tx_hash}|${d.sender_id}`;
        if (!existingTxKey.has(senderKey) && fromAddr) {
          txRows.push({ ...base, user_id: d.sender_id });
          existingTxKey.add(senderKey);
        }
      }

      // Recipient-side (luôn chạy, kể cả ví ngoài)
      const recipientKey = `${d.tx_hash}|${d.recipient_id}`;
      if (d.sender_id !== d.recipient_id && !existingTxKey.has(recipientKey)) {
        txRows.push({ ...base, user_id: d.recipient_id });
        existingTxKey.add(recipientKey);
      }

      // gift_celebration post: CHỈ tạo cho giao dịch nội bộ (không phải ví ngoài).
      // Theo policy external-wallet-no-gift-policy.
      if (
        d.sender_id && sender && !d.is_external &&
        !existingPostTx.has(d.tx_hash)
      ) {
        const senderName = sender.display_name || sender.username;
        const recipientName = recipient.display_name || recipient.username;
        postRows.push({
          user_id: d.sender_id,
          content: `${senderName} đã tặng ${d.amount} ${d.token_symbol} cho ${recipientName}`,
          post_type: "gift_celebration",
          tx_hash: d.tx_hash,
          gift_sender_id: d.sender_id,
          gift_recipient_id: d.recipient_id,
          gift_token: d.token_symbol,
          gift_amount: String(d.amount ?? ""),
          gift_message: d.message || null,
          is_highlighted: true,
          visibility: "public",
          moderation_status: "approved",
          created_at: d.created_at,
        });
        existingPostTx.add(d.tx_hash);
      }
    }


    // 6. Insert tx rows in chunks
    let txInserted = 0;
    {
      const CHUNK = 200;
      for (let i = 0; i < txRows.length; i += CHUNK) {
        const batch = txRows.slice(i, i + CHUNK);
        const { error } = await supabase.from("transactions").insert(batch);
        if (error) {
          console.error(`tx insert batch ${i} error:`, error.message);
        } else {
          txInserted += batch.length;
        }
      }
    }

    // 7. Insert posts in chunks
    let postsCreated = 0;
    {
      const CHUNK = 100;
      for (let i = 0; i < postRows.length; i += CHUNK) {
        const batch = postRows.slice(i, i + CHUNK);
        const { error } = await supabase.from("posts").insert(batch);
        if (error) {
          console.error(`post insert batch ${i} error:`, error.message);
        } else {
          postsCreated += batch.length;
        }
      }
    }

    console.log(`[backfill-don-to-tx] scanned=${allDonations.length} tx=${txInserted} posts=${postsCreated} window=${windowDays}d`);
    return new Response(JSON.stringify({
      donations_scanned: allDonations.length,
      tx_rows_inserted: txInserted,
      posts_created: postsCreated,
      window_days: windowDays,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("backfill-donations-to-transactions error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
