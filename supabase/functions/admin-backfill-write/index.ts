// admin-backfill-write — ghi các dòng admin ĐÃ XÁC NHẬN trong preview.
//
// Bất biến:
// - Verify JWT + `has_role(admin)` TRONG CODE (không chỉ dựa RLS).
// - Chỉ ghi dòng `selected = true` (internal/external_in) + `swap_suspect`
//   (chỉ lưu vết `transactions`, không vào `donations`).
// - Ghi qua `_shared/ingestTransfer.ts` ⇒ idempotent theo (tx_hash, user_id);
//   chạy 2 lần thì lần 2 ghi 0 dòng.
// - Audit `audit_logs` với admin_id = auth.uid() THẬT.

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { requireUser } from "../_shared/httpAuth.ts";
import { ingestTransfer, type IngestClassification } from "../_shared/ingestTransfer.ts";

function jsonRes(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createAdminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return jsonRes({ ok: false, error: "thiếu job_id" }, 400);

    const user = await requireUser(req);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (isAdmin !== true) {
      return jsonRes({ ok: false, error: "Chỉ admin được ghi backfill" }, 403);
    }

    const { data: job } = await admin
      .from("admin_backfill_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return jsonRes({ ok: false, error: "không tìm thấy job" }, 404);
    if (!["preview_ready", "writing", "done"].includes(String(job.status))) {
      return jsonRes({ ok: false, error: `job chưa sẵn sàng ghi (${job.status})` }, 409);
    }

    await admin.from("admin_backfill_jobs").update({ status: "writing" }).eq("id", jobId);

    const { data: rows } = await admin
      .from("admin_backfill_candidates")
      .select("*")
      .eq("job_id", jobId)
      .eq("written", false)
      .in("classification", ["internal", "external_in", "swap_suspect"]);

    // Map ví gửi → user (chỉ dùng cho internal, giữ đúng sender_id)
    const senderAddrs = [...new Set((rows ?? []).map((r) => String(r.from_address)))];
    const senderMap = new Map<string, string>();
    for (let i = 0; i < senderAddrs.length; i += 100) {
      const slice = senderAddrs.slice(i, i + 100);
      const { data: ps } = await admin
        .from("profiles")
        .select("id, public_wallet_address, wallet_address, external_wallet_address")
        .or(
          slice.map((a) =>
            `public_wallet_address.eq.${a},wallet_address.eq.${a},external_wallet_address.eq.${a}`
          ).join(","),
        );
      for (const p of ps ?? []) {
        for (const w of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
          if (typeof w === "string") senderMap.set(w.toLowerCase(), String(p.id));
        }
      }
    }

    let written = 0;
    let skipped = 0;
    let donationsWritten = 0;
    const errors: string[] = [];

    for (const r of rows ?? []) {
      const classification = String(r.classification) as IngestClassification;
      // Chỉ ghi dòng admin đã tick; swap_suspect chỉ lưu vết, không cần tick.
      if (classification !== "swap_suspect" && r.selected !== true) {
        skipped++;
        continue;
      }
      try {
        const res = await ingestTransfer(admin, {
          tx_hash: String(r.tx_hash),
          block_number: Number(r.block_number),
          from_address: String(r.from_address),
          to_address: String(r.to_address),
          token_symbol: String(r.token_symbol),
          token_address: r.token_address ? String(r.token_address) : null,
          amount_display: String(r.amount_display),
          usd_value: r.usd_value === null ? null : Number(r.usd_value),
          classification,
          matched_user_id: r.matched_user_id ? String(r.matched_user_id) : null,
          sender_user_id: senderMap.get(String(r.from_address).toLowerCase()) ?? null,
          chain_id: 56,
        });
        if (res.transaction_written || res.donation_written) {
          written++;
          if (res.donation_written) donationsWritten++;
        } else {
          skipped++;
        }
        await admin
          .from("admin_backfill_candidates")
          .update({ written: true, written_at: new Date().toISOString() })
          .eq("id", r.id);
      } catch (e) {
        skipped++;
        errors.push(`${r.tx_hash}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await admin
      .from("admin_backfill_jobs")
      .update({
        status: "done",
        stats: { ...(job.stats ?? {}), rows_written: written, rows_skipped: skipped },
      })
      .eq("id", jobId);

    await admin.from("audit_logs").insert({
      admin_id: user.id,
      action: "admin_backfill_write",
      details: {
        job_id: jobId,
        scope: job.scope,
        wallets: job.wallets,
        from_block: job.from_block,
        to_block: job.to_block,
        rows_written: written,
        donations_written: donationsWritten,
        rows_skipped: skipped,
      },
      reason: "Admin backfill giao dịch on-chain",
    });

    return jsonRes({
      ok: true,
      job_id: jobId,
      rows_written: written,
      donations_written: donationsWritten,
      rows_skipped: skipped,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("Authorization") || msg.includes("Unauthorized") ? 401 : 500;
    console.error("[admin-backfill-write] lỗi:", msg);
    return jsonRes({ ok: false, error: msg }, status);
  }
});
