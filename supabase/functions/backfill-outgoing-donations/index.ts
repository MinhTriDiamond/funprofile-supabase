import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3 },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18 },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisKey) throw new Error("MORALIS_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { user_id, wallet_address, mode = "scan" } = body;

    if (!user_id && !wallet_address) {
      return new Response(
        JSON.stringify({ error: "user_id or wallet_address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get sender profile and all wallet addresses
    let senderProfile: any = null;
    if (user_id) {
      const { data } = await admin.from("profiles")
        .select("id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address, created_at")
        .eq("id", user_id)
        .single();
      senderProfile = data;
    } else {
      const wLower = wallet_address.toLowerCase();
      const { data: profiles } = await admin.from("profiles")
        .select("id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address, created_at");
      for (const p of profiles || []) {
        const addrs = [p.wallet_address, p.public_wallet_address, p.external_wallet_address].filter(Boolean);
        if (addrs.some((a: string) => a.toLowerCase() === wLower)) {
          senderProfile = p;
          break;
        }
      }
    }

    if (!senderProfile) {
      return new Response(
        JSON.stringify({ error: "Sender profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderWallets = [
      senderProfile.wallet_address,
      senderProfile.public_wallet_address,
      senderProfile.external_wallet_address,
    ].filter(Boolean).map((a: string) => a.toLowerCase());

    if (senderWallets.length === 0) {
      return new Response(
        JSON.stringify({ error: "User has no wallet addresses" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userCreatedAt = senderProfile.created_at ? new Date(senderProfile.created_at) : new Date("2025-01-01");
    console.log(`Scanning outgoing for ${senderProfile.username}, wallets: ${senderWallets.join(", ")}, since ${userCreatedAt.toISOString()}`);

    // 2. Build wallet->profile map for ALL fun.rich users
    const { data: allProfiles } = await admin.from("profiles")
      .select("id, username, display_name, wallet_address, public_wallet_address, external_wallet_address");

    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null }>();
    for (const p of allProfiles || []) {
      const info = { id: p.id, username: p.username, display_name: p.display_name };
      for (const addr of [p.wallet_address, p.public_wallet_address, p.external_wallet_address]) {
        if (addr) {
          const lower = addr.toLowerCase();
          if (!walletToProfile.has(lower)) walletToProfile.set(lower, info);
        }
      }
    }

    // 3. Fetch ALL outgoing ERC20 transfers via Moralis (with BSCScan v2 fallback)
    const allTransfers: any[] = [];

    for (const senderWallet of senderWallets) {
      let moralisOk = false;
      
      // Try Moralis first
      let cursor: string | null = null;
      let pages = 0;
      const maxPages = 20;

      do {
        const params = new URLSearchParams({
          chain: "bsc",
          limit: "100",
          order: "DESC",
        });
        if (cursor) params.set("cursor", cursor);

        const url = `https://deep-index.moralis.io/api/v2.2/${senderWallet}/erc20/transfers?${params.toString()}`;
        const res = await moralisFetch(url, {
          headers: { accept: "application/json" },
        });

        if (!res.ok) {
          console.error(`Moralis error for ${senderWallet}: ${res.status}`);
          break;
        }

        moralisOk = true;
        const data = await res.json();
        const transfers = data.result || [];

        for (const t of transfers) {
          if (t.from_address?.toLowerCase() !== senderWallet) continue;

          const tokenAddr = t.address?.toLowerCase();
          if (!tokenAddr || !KNOWN_TOKENS[tokenAddr]) continue;

          const blockTime = t.block_timestamp ? new Date(t.block_timestamp) : null;
          if (blockTime && blockTime < userCreatedAt) continue;

          allTransfers.push({
            ...t,
            _sender_wallet: senderWallet,
            _token_info: KNOWN_TOKENS[tokenAddr],
          });
        }

        cursor = data.cursor || null;
        pages++;

        if (transfers.length > 0) {
          const oldest = transfers[transfers.length - 1];
          if (oldest.block_timestamp && new Date(oldest.block_timestamp) < userCreatedAt) {
            cursor = null;
          }
        }
      } while (cursor && pages < maxPages);

      console.log(`Wallet ${senderWallet}: Moralis fetched ${pages} pages, ok=${moralisOk}`);

      // Fallback to BSCScan v2 if Moralis failed
      if (!moralisOk) {
        console.log(`Falling back to BSCScan for ${senderWallet}`);
        const knownContracts = Object.keys(KNOWN_TOKENS);
        
        for (const contractAddr of knownContracts) {
          let bscPage = 1;
          const maxBscPages = 10;
          
          while (bscPage <= maxBscPages) {
            const bscUrl = `https://api.etherscan.io/v2/api?chainid=56&module=account&action=tokentx&contractaddress=${contractAddr}&address=${senderWallet}&page=${bscPage}&offset=100&startblock=0&endblock=99999999&sort=desc`;
            
            try {
              const bscRes = await fetch(bscUrl);
              if (!bscRes.ok) {
                console.error(`BSCScan error: ${bscRes.status}`);
                break;
              }
              
              const bscData = await bscRes.json();
              const txs = bscData.result;
              
              if (!Array.isArray(txs) || txs.length === 0) break;
              
              let hasOld = false;
              for (const tx of txs) {
                if (tx.from?.toLowerCase() !== senderWallet) continue;
                
                const tokenInfo = KNOWN_TOKENS[contractAddr];
                const blockTime = tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : null;
                if (blockTime && blockTime < userCreatedAt) {
                  hasOld = true;
                  continue;
                }
                
                allTransfers.push({
                  transaction_hash: tx.hash,
                  from_address: tx.from?.toLowerCase(),
                  to_address: tx.to?.toLowerCase(),
                  value: tx.value,
                  address: contractAddr,
                  block_timestamp: blockTime?.toISOString() || null,
                  block_number: tx.blockNumber,
                  _sender_wallet: senderWallet,
                  _token_info: tokenInfo,
                });
              }
              
              if (hasOld || txs.length < 100) break;
              bscPage++;
              
              // Rate limit: 200ms between calls
              await new Promise(r => setTimeout(r, 200));
            } catch (e) {
              console.error(`BSCScan fetch error: ${e.message}`);
              break;
            }
          }
          
          console.log(`BSCScan ${KNOWN_TOKENS[contractAddr].symbol}: ${bscPage} pages for ${senderWallet}`);
        }
      }
    }

    console.log(`Total outgoing transfers found: ${allTransfers.length}`);

    // 4. Filter: only to fun.rich wallets
    const toFunRich = allTransfers.filter((t) => {
      const toAddr = t.to_address?.toLowerCase();
      return toAddr && walletToProfile.has(toAddr) && walletToProfile.get(toAddr)!.id !== senderProfile.id;
    });

    console.log(`Transfers to fun.rich users: ${toFunRich.length}`);

    // 5. Dedup: check existing donations
    const txHashes = toFunRich.map((t) => t.transaction_hash).filter(Boolean);
    const existingSet = new Set<string>();

    // Query in batches of 100
    for (let i = 0; i < txHashes.length; i += 100) {
      const batch = txHashes.slice(i, i + 100);
      const { data: existing } = await admin.from("donations").select("tx_hash").in("tx_hash", batch);
      for (const d of existing || []) {
        if (d.tx_hash) existingSet.add(d.tx_hash.toLowerCase());
      }
    }

    const missing = toFunRich.filter(
      (t) => t.transaction_hash && !existingSet.has(t.transaction_hash.toLowerCase())
    );

    console.log(`Missing donations to insert: ${missing.length}`);

    // Build summary for scan mode
    const summary = missing.map((t) => {
      const tokenInfo = t._token_info;
      const rawAmount = BigInt(t.value || "0");
      const amount = Number(rawAmount) / Math.pow(10, tokenInfo.decimals);
      const recipient = walletToProfile.get(t.to_address.toLowerCase());
      return {
        tx_hash: t.transaction_hash,
        to_address: t.to_address,
        recipient_username: recipient?.username || "unknown",
        recipient_id: recipient?.id || null,
        amount,
        token: tokenInfo.symbol,
        block_timestamp: t.block_timestamp,
      };
    });

    if (mode === "scan") {
      return new Response(
        JSON.stringify({
          mode: "scan",
          sender: senderProfile.username,
          sender_wallets: senderWallets,
          total_outgoing: allTransfers.length,
          to_funrich: toFunRich.length,
          already_recorded: existingSet.size,
          missing_count: missing.length,
          missing_donations: summary,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mode: backfill - insert missing donations + posts
    let created = 0;
    let errors = 0;
    const senderName = senderProfile.display_name || senderProfile.username;
    const results: any[] = [];

    for (const item of summary) {
      try {
        const confirmedAt = item.block_timestamp
          ? new Date(item.block_timestamp).toISOString()
          : new Date().toISOString();

        const recipient = walletToProfile.get(
          missing.find((m) => m.transaction_hash === item.tx_hash)?.to_address?.toLowerCase() || ""
        );
        const recipientName = recipient?.display_name || recipient?.username || item.recipient_username;

        // Insert donation
        const { data: donation, error: donErr } = await admin
          .from("donations")
          .insert({
            sender_id: senderProfile.id,
            recipient_id: item.recipient_id,
            amount: String(item.amount),
            token_symbol: item.token,
            token_address: Object.keys(KNOWN_TOKENS).find(
              (k) => KNOWN_TOKENS[k].symbol === item.token
            ) || null,
            tx_hash: item.tx_hash,
            status: "confirmed",
            confirmed_at: confirmedAt,
            created_at: confirmedAt,
            chain_id: 56,
            card_theme: "celebration",
            card_sound: "rich-1",
            message: null,
            light_score_earned: 0,
            is_external: false,
            metadata: { source: "backfill_outgoing" },
          })
          .select("id")
          .single();

        if (donErr) {
          console.warn(`Skip ${item.tx_hash}: ${donErr.message}`);
          results.push({ tx_hash: item.tx_hash, status: "error", reason: donErr.message });
          errors++;
          continue;
        }

        // Create gift_celebration post
        const { data: post } = await admin
          .from("posts")
          .insert({
            user_id: senderProfile.id,
            content: `${senderName} đã tặng ${item.amount} ${item.token} cho ${recipientName}`,
            post_type: "gift_celebration",
            tx_hash: item.tx_hash,
            gift_sender_id: senderProfile.id,
            gift_recipient_id: item.recipient_id,
            gift_token: item.token,
            gift_amount: String(item.amount),
            gift_message: null,
            is_highlighted: true,
            visibility: "public",
            moderation_status: "approved",
            created_at: confirmedAt,
          })
          .select("id")
          .single();

        // Link post
        if (post?.id && donation?.id) {
          await admin.from("donations").update({ post_id: post.id }).eq("id", donation.id);
        }

        // Notification
        if (item.recipient_id && item.recipient_id !== senderProfile.id) {
          await admin.from("notifications").insert({
            user_id: item.recipient_id,
            actor_id: senderProfile.id,
            type: "donation",
            post_id: post?.id || null,
            read: false,
            created_at: confirmedAt,
          });
        }

        results.push({
          tx_hash: item.tx_hash,
          status: "created",
          donation_id: donation?.id,
          amount: item.amount,
          token: item.token,
          recipient: item.recipient_username,
        });
        created++;
      } catch (e) {
        results.push({ tx_hash: item.tx_hash, status: "error", reason: e.message });
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        mode: "backfill",
        sender: senderProfile.username,
        total_outgoing: allTransfers.length,
        to_funrich: toFunRich.length,
        missing_count: missing.length,
        created,
        errors,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("backfill-outgoing-donations error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
