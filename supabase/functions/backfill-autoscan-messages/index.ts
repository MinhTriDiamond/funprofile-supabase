import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * One-time backfill: Tạo chat messages cho auto-scanned donations.
 * Chạy sau khi notifications đã được backfill xong.
 */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const adminClient = createAdminClient();

    // Get internal donations - process in smaller batches
    const url = new URL(req.url);
    const senderFilter = url.searchParams.get("sender_id") || null;
    
    let query = adminClient
      .from("donations")
      .select("id, sender_id, recipient_id, amount, token_symbol, tx_hash, created_at")
      .not("sender_id", "is", null)
      .not("recipient_id", "is", null)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true })
      .limit(500);
    
    if (senderFilter) {
      query = query.eq("sender_id", senderFilter);
    }
    
    const { data: donations } = await query;

    if (!donations || donations.length === 0) {
      return new Response(JSON.stringify({ message: "No donations", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter: only sender != recipient
    const internalDonations = donations.filter(d => d.sender_id !== d.recipient_id);
    console.log(`Processing ${internalDonations.length} internal donations`);

    // Get profiles
    const userIds = [...new Set(internalDonations.flatMap(d => [d.sender_id, d.recipient_id]))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, username, display_name")
      .in("id", userIds);

    const profileMap = new Map<string, { username: string; display_name: string | null }>();
    for (const p of profiles || []) {
      profileMap.set(p.id, { username: p.username, display_name: p.display_name });
    }

    // Pre-fetch ALL direct conversations with their participants in one go
    const { data: allConvParts } = await adminClient
      .from("conversation_participants")
      .select("conversation_id, user_id, conversations!inner(type)")
      .eq("conversations.type", "direct")
      .in("user_id", userIds)
      .limit(5000);

    // Build conversation lookup: for each pair of users, find their direct conversation
    const convByParticipants = new Map<string, string[]>(); // conv_id -> user_ids
    for (const cp of allConvParts || []) {
      const cid = cp.conversation_id;
      if (!convByParticipants.has(cid)) convByParticipants.set(cid, []);
      convByParticipants.get(cid)!.push(cp.user_id);
    }

    const pairToConv = new Map<string, string>(); // "senderId_recipientId" -> conv_id
    for (const [cid, users] of convByParticipants) {
      if (users.length === 2) {
        const key1 = `${users[0]}_${users[1]}`;
        const key2 = `${users[1]}_${users[0]}`;
        pairToConv.set(key1, cid);
        pairToConv.set(key2, cid);
      }
    }

    // Group donations by sender+recipient
    const pairDonationsMap = new Map<string, typeof internalDonations>();
    for (const d of internalDonations) {
      const key = `${d.sender_id}_${d.recipient_id}`;
      if (!pairDonationsMap.has(key)) pairDonationsMap.set(key, []);
      pairDonationsMap.get(key)!.push(d);
    }

    let msgCount = 0;
    let convCreated = 0;

    for (const [pairKey, pairDons] of pairDonationsMap) {
      const [senderId, recipientId] = pairKey.split("_");
      const senderProfile = profileMap.get(senderId);
      const senderName = senderProfile?.display_name || senderProfile?.username || "Unknown";

      let conversationId = pairToConv.get(pairKey) || null;

      // Create conversation if not exists
      if (!conversationId) {
        const { data: newConv } = await adminClient
          .from("conversations")
          .insert({ type: "direct", created_by: senderId })
          .select("id")
          .single();
        if (newConv) {
          conversationId = newConv.id;
          await adminClient.from("conversation_participants").insert([
            { conversation_id: conversationId, user_id: senderId, role: "member" },
            { conversation_id: conversationId, user_id: recipientId, role: "member" },
          ]);
          pairToConv.set(pairKey, conversationId);
          convCreated++;
        }
      }

      if (!conversationId) continue;

      // Check existing gift messages in this conversation
      const { data: existingMsgs } = await adminClient
        .from("messages")
        .select("content")
        .eq("conversation_id", conversationId)
        .eq("sender_id", senderId)
        .like("content", "%đã tặng bạn%")
        .limit(500);

      const existingSet = new Set((existingMsgs || []).map(m => m.content));

      // Batch insert messages
      const msgsToInsert = [];
      for (const d of pairDons) {
        const txShort = d.tx_hash.substring(0, 10) + "...";
        const msgContent = `🎁 ${senderName} đã tặng bạn ${d.amount} ${d.token_symbol}!\n💰 TX: ${txShort}`;

        if (existingSet.has(msgContent)) continue;

        msgsToInsert.push({
          conversation_id: conversationId,
          sender_id: senderId,
          content: msgContent,
          created_at: d.created_at,
        });
      }

      if (msgsToInsert.length > 0) {
        for (let i = 0; i < msgsToInsert.length; i += 50) {
          const batch = msgsToInsert.slice(i, i + 50);
          const { error } = await adminClient.from("messages").insert(batch);
          if (error) console.error(`Msg error for ${pairKey}:`, error);
          else msgCount += batch.length;
        }

        // Update conversation last_message
        const lastMsg = msgsToInsert[msgsToInsert.length - 1];
        await adminClient.from("conversations").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: lastMsg.content.substring(0, 100),
        }).eq("id", conversationId);
      }
    }

    console.log(`Backfill done: ${msgCount} messages, ${convCreated} convs created`);

    return new Response(
      JSON.stringify({
        success: true,
        messages_sent: msgCount,
        conversations_created: convCreated,
        pairs_processed: pairDonationsMap.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("backfill error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
