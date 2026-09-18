// Public proxy: stream MP4 từ R2 / Cloudflare Stream về client kèm
// Content-Disposition: attachment để browser luôn TẢI XUỐNG, không phát inline.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, content-disposition",
};

const ALLOWED_HOSTS = [
  /^media\.fun\.rich$/i,
  /^pub-[a-f0-9]+\.r2\.dev$/i,
  /^customer-[a-z0-9]+\.cloudflarestream\.com$/i,
  /^videodelivery\.net$/i,
  /\.cloudflarestream\.com$/i,
  /\.supabase\.co$/i,
  /\.supabase\.in$/i,
  /\.r2\.cloudflarestorage\.com$/i,
];

function sniffContentType(url: string, upstream: Response): string {
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt && upstreamCt !== "application/octet-stream") return upstreamCt;
  const lower = url.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}

function isAllowed(host: string): boolean {
  return ALLOWED_HOSTS.some((re) => re.test(host));
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return cleaned.endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function defaultFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `live-replay-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
    d.getUTCDate(),
  )}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.mp4`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    const filenameParam = url.searchParams.get("filename");

    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.protocol !== "https:" || !isAllowed(parsed.hostname)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filename = filenameParam
      ? sanitizeFilename(filenameParam)
      : defaultFilename();

    // Forward Range để hỗ trợ tải tiếp / seek
    const upstreamHeaders = new Headers();
    const range = req.headers.get("range");
    if (range) upstreamHeaders.set("Range", range);

    const upstream = await fetch(parsed.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(
        JSON.stringify({ error: `Upstream ${upstream.status}` }),
        {
          status: upstream.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", sniffContentType(parsed.pathname, upstream));
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    headers.set("Cache-Control", "private, max-age=0, no-store");
    headers.set("Accept-Ranges", "bytes");

    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("[replay-download] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
