// DISABLED: Tính năng tự động xóa Live Replay sau 30 ngày đã được hủy.
// Edge function giữ lại làm no-op để không vỡ deploy history / cron call lịch sử.
// Muốn bật lại: revert commit này + re-create trigger trg_set_live_replay_expiry
// + re-schedule cron 'live-replay-expiry-hourly'.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      disabled: true,
      message:
        "Live Replay auto-expiry đã bị hủy. Video Replay tồn tại vĩnh viễn cho tới khi chủ post tự xóa.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
