import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch } from "../_shared/moralisFetch.ts";

/**
 * Setup Moralis Stream — Đăng ký/cập nhật stream theo dõi ERC20 transfers
 * đến tất cả ví fun.rich. Chạy 1 lần để setup, và chạy lại khi cần cập nhật.
 */

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const KNOWN_TOKEN_ADDRESSES = [
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
  "0x0910320181889fefde0bb1ca63962b0a8882e413", // CAMLY
];

const TESTNET_TOKEN_ADDRESSES = [
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6", // FUN
];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const streamSecret = Deno.env.get("MORALIS_STREAM_SECRET");
    if (!streamSecret) {
      return new Response(JSON.stringify({ error: "MORALIS_STREAM_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/moralis-webhook`;

    const adminClient = createAdminClient();

    // Get body params
    const body = await req.json().catch(() => ({}));
    const action = body.action || "create"; // "create" | "update" | "delete" | "status"
    const streamId = body.stream_id || null;

    // Get all wallet addresses
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("public_wallet_address")
      .not("public_wallet_address", "is", null);

    const walletAddresses = (profiles || [])
      .map(p => p.public_wallet_address?.toLowerCase())
      .filter(Boolean) as string[];

    console.log(`Found ${walletAddresses.length} wallet addresses to monitor`);

    const moralisHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const streamsApiBase = "https://api.moralis-streams.com/streams/evm";

    if (action === "status") {
      // List existing streams
      const res = await moralisFetch(`${streamsApiBase}?limit=100`, { headers: moralisHeaders });
      const data = await res.json();
      return new Response(JSON.stringify({ streams: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete" && streamId) {
      const res = await moralisFetch(`${streamsApiBase}/${streamId}`, {
        method: "DELETE",
        headers: moralisHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify({ deleted: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update" && streamId) {
      // Update addresses on existing stream
      // Moralis Streams API: POST /streams/evm/{id}/address to add addresses
      // First, get current addresses
      const getRes = await moralisFetch(`${streamsApiBase}/${streamId}/address`, {
        headers: moralisHeaders,
      });
      const currentData = await getRes.json();
      const currentAddresses = new Set(
        (currentData.result || []).map((a: { address: string }) => a.address.toLowerCase())
      );

      // Find new addresses to add
      const newAddresses = walletAddresses.filter(addr => !currentAddresses.has(addr));

      if (newAddresses.length === 0) {
        return new Response(JSON.stringify({ message: "No new addresses to add", total: walletAddresses.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add addresses in batches of 50
      let addedCount = 0;
      for (let i = 0; i < newAddresses.length; i += 50) {
        const batch = newAddresses.slice(i, i + 50);
        const addRes = await moralisFetch(`${streamsApiBase}/${streamId}/address`, {
          method: "POST",
          headers: moralisHeaders,
          body: JSON.stringify({ address: batch }),
        });
        if (addRes.ok) {
          addedCount += batch.length;
        } else {
          const errText = await addRes.text();
          console.error(`Failed to add batch ${i}:`, errText);
        }
      }

      return new Response(
        JSON.stringify({
          message: `Added ${addedCount} new addresses`,
          totalMonitored: walletAddresses.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "create" — Create new stream
    const streamPayload = {
      webhookUrl,
      description: "Fun.Rich - Monitor ERC20 transfers to user wallets",
      tag: "fun-rich-donations",
      topic0: [ERC20_TRANSFER_TOPIC],
      includeContractLogs: true,
      includeNativeTxs: false,
      chainIds: ["0x38"], // BSC Mainnet
      advancedOptions: [
        {
          topic0: ERC20_TRANSFER_TOPIC,
          filter: {
            // Only monitor known token contracts
            in: ["address", KNOWN_TOKEN_ADDRESSES],
          },
        },
      ],
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, name: "from", type: "address" },
            { indexed: true, name: "to", type: "address" },
            { indexed: false, name: "value", type: "uint256" },
          ],
          name: "Transfer",
          type: "event",
        },
      ],
    };

    // Create the stream
    const createRes = await moralisFetch(streamsApiBase, {
      method: "PUT",
      headers: moralisHeaders,
      body: JSON.stringify(streamPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Failed to create stream:", errText);
      return new Response(JSON.stringify({ error: `Moralis API error: ${createRes.status}`, details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const streamData = await createRes.json();
    const newStreamId = streamData.id;
    console.log(`Created stream: ${newStreamId}`);

    // Add wallet addresses in batches
    let addedCount = 0;
    for (let i = 0; i < walletAddresses.length; i += 50) {
      const batch = walletAddresses.slice(i, i + 50);
      const addRes = await moralisFetch(`${streamsApiBase}/${newStreamId}/address`, {
        method: "POST",
        headers: moralisHeaders,
        body: JSON.stringify({ address: batch }),
      });
      if (addRes.ok) {
        addedCount += batch.length;
        console.log(`Added batch ${i}-${i + batch.length}: ${batch.length} addresses`);
      } else {
        const errText = await addRes.text();
        console.error(`Failed to add batch ${i}:`, errText);
      }
    }

    // Optionally create a second stream for BSC Testnet (FUN token)
    let testnetStreamId = null;
    try {
      const testnetPayload = {
        ...streamPayload,
        description: "Fun.Rich - Monitor FUN token transfers (Testnet)",
        tag: "fun-rich-donations-testnet",
        chainIds: ["0x61"], // BSC Testnet
        advancedOptions: [
          {
            topic0: ERC20_TRANSFER_TOPIC,
            filter: {
              in: ["address", TESTNET_TOKEN_ADDRESSES],
            },
          },
        ],
      };

      const testnetRes = await moralisFetch(streamsApiBase, {
        method: "PUT",
        headers: moralisHeaders,
        body: JSON.stringify(testnetPayload),
      });

      if (testnetRes.ok) {
        const testnetData = await testnetRes.json();
        testnetStreamId = testnetData.id;

        // Add same addresses to testnet stream
        for (let i = 0; i < walletAddresses.length; i += 50) {
          const batch = walletAddresses.slice(i, i + 50);
          await moralisFetch(`${streamsApiBase}/${testnetStreamId}/address`, {
            method: "POST",
            headers: moralisHeaders,
            body: JSON.stringify({ address: batch }),
          });
        }
        console.log(`Created testnet stream: ${testnetStreamId}`);
      }
    } catch (testnetErr) {
      console.error("Testnet stream error (non-critical):", testnetErr);
    }

    // Save stream IDs to app_settings for future reference
    await adminClient.from("app_settings").upsert(
      { key: "moralis_stream_id", value: newStreamId },
      { onConflict: "key" }
    );
    if (testnetStreamId) {
      await adminClient.from("app_settings").upsert(
        { key: "moralis_stream_testnet_id", value: testnetStreamId },
        { onConflict: "key" }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        streamId: newStreamId,
        testnetStreamId,
        addressesAdded: addedCount,
        webhookUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("setup-moralis-stream error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
