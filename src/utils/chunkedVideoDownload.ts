import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Download a chunked recording by fetching manifest, all chunks, concatenating into a single blob */
export async function downloadChunkedVideo(
  manifestUrl: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const toastId = toast.loading("Đang chuẩn bị tải video...", { duration: Infinity });

  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error("Không thể tải manifest");
    const manifest = await res.json();

    const chunks: { url: string }[] = manifest.chunks || [];
    if (chunks.length === 0) throw new Error("Video không có dữ liệu");

    const mimeType = manifest.mime_type || "video/webm";
    const totalChunks = chunks.length;
    const blobs: Blob[] = [];

    toast.loading(`Đang tải video (0/${totalChunks})...`, { id: toastId });

    const BATCH_SIZE = 6;
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (chunk) => {
          const r = await fetch(chunk.url);
          if (!r.ok) throw new Error(`Lỗi tải chunk ${chunk.url}`);
          return r.blob();
        })
      );
      blobs.push(...results);

      const done = Math.min(i + BATCH_SIZE, totalChunks);
      const pct = Math.round((done / totalChunks) * 100);
      onProgress?.(pct);
      toast.loading(`Đang tải video (${done}/${totalChunks}) - ${pct}%`, { id: toastId });
    }

    const finalBlob = new Blob(blobs, { type: mimeType });
    triggerBlobDownload(finalBlob, `live-replay-${Date.now()}.webm`);
    toast.success("Tải video thành công!", { id: toastId });
  } catch (err: unknown) {
    console.error("Download chunked video error:", err);
    toast.error(err instanceof Error ? err.message : "Lỗi khi tải video", { id: toastId });
  }
}

/** Tạo URL proxy edge function `replay-download` luôn trả Content-Disposition: attachment. */
function buildProxyUrl(url: string, filename: string): string {
  return `${SUPABASE_URL}/functions/v1/replay-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

function defaultMp4Filename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `live-replay-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.mp4`;
}

function normalizeFilename(name: string | undefined, fallback: string): string {
  if (!name || !name.trim()) return fallback;
  return name.endsWith(".mp4") ? name : `${name}.mp4`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

/** Fetch URL → Blob với progress toast. Trả Blob hoặc null nếu lỗi. */
async function fetchAsBlobWithProgress(
  url: string,
  toastId: string | number,
): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            toast.loading(
              `Đang tải MP4 ${pct}% (${(received / 1048576).toFixed(1)} MB)`,
              { id: toastId },
            );
          } else {
            toast.loading(`Đang tải MP4 ${(received / 1048576).toFixed(1)} MB`, { id: toastId });
          }
        }
      }
    } else {
      const buf = await res.arrayBuffer();
      chunks.push(new Uint8Array(buf));
    }

    return new Blob(chunks as BlobPart[], { type: "video/mp4" });
  } catch (err) {
    console.warn("[fetchAsBlobWithProgress] failed", url, err);
    return null;
  }
}

/**
 * Tải MP4 trực tiếp về máy. LUÔN tải xuống, không bao giờ mở tab mới.
 * Thử fetch trực tiếp trước; nếu lỗi (CORS / 404) tự fallback sang edge proxy
 * `replay-download` trả Content-Disposition: attachment.
 */
export async function downloadDirectMp4(
  url: string,
  filenameHint?: string,
): Promise<void> {
  const filename = normalizeFilename(filenameHint, defaultMp4Filename());
  const toastId = toast.loading("Đang chuẩn bị tải video MP4...", { duration: Infinity });

  // Bước 1: thử fetch trực tiếp R2 / CDN
  let blob = await fetchAsBlobWithProgress(url, toastId);

  // Bước 2: fallback qua edge proxy nếu fetch trực tiếp lỗi
  if (!blob) {
    toast.loading("Đang chuyển sang đường tải dự phòng...", { id: toastId });
    blob = await fetchAsBlobWithProgress(buildProxyUrl(url, filename), toastId);
  }

  if (!blob) {
    toast.error("Không tải được video. Vui lòng thử lại sau.", { id: toastId });
    return;
  }

  triggerBlobDownload(blob, filename);
  toast.success("Tải video thành công!", { id: toastId });
}

/**
 * Chuyển HLS URL của Cloudflare Stream → MP4 download URL.
 *   .../<uid>/manifest/video.m3u8  →  .../<uid>/downloads/default.mp4
 */
export function deriveCloudflareMp4Url(url: string): string | null {
  if (/\/downloads\/default\.mp4$/.test(url)) return url;
  const m = url.match(
    /^(https:\/\/(?:customer-[a-z0-9]+\.cloudflarestream\.com|videodelivery\.net)\/[a-f0-9]+)\/manifest\/video\.m3u8/i,
  );
  return m ? `${m[1]}/downloads/default.mp4` : null;
}

/**
 * Tải MP4 từ Cloudflare Stream về máy. LUÔN tải xuống, không bao giờ mở tab mới.
 */
export async function downloadCloudflareMp4(
  hlsOrMp4Url: string,
  filenameHint?: string,
): Promise<void> {
  const mp4 = deriveCloudflareMp4Url(hlsOrMp4Url) || hlsOrMp4Url;
  const filename = normalizeFilename(filenameHint, defaultMp4Filename());
  const toastId = toast.loading("Đang chuẩn bị tải video MP4...", { duration: Infinity });

  let blob = await fetchAsBlobWithProgress(mp4, toastId);

  if (!blob) {
    toast.loading("Đang chuyển sang đường tải dự phòng...", { id: toastId });
    blob = await fetchAsBlobWithProgress(buildProxyUrl(mp4, filename), toastId);
  }

  if (!blob) {
    toast.error("Không tải được video. Vui lòng thử lại sau.", { id: toastId });
    return;
  }

  triggerBlobDownload(blob, filename);
  toast.success("Tải video MP4 thành công!", { id: toastId });
}
