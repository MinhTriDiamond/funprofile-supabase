/**
 * videoPoster — sinh poster (frame đầu tiên) từ File video local.
 * Chạy trong browser, dùng <video> + canvas. Bỏ qua nếu decode thất bại (autoplay policy, codec lạ).
 * Kết quả là blob URL — nhớ URL.revokeObjectURL khi không dùng nữa.
 */

export interface VideoPosterResult {
  posterUrl: string;
  width: number;
  height: number;
  duration: number;
}

export async function generateVideoPoster(file: File, seekTime = 0.1): Promise<VideoPosterResult | null> {
  if (typeof document === 'undefined') return null;
  if (!file || !file.type.startsWith('video/')) return null;

  return new Promise((resolve) => {
    let objectUrl: string | null = null;
    let settled = false;

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    const finish = (result: VideoPosterResult | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    // Safety timeout — 4s là quá đủ cho frame đầu.
    const timeoutId = window.setTimeout(() => finish(null), 4000);

    video.addEventListener('loadedmetadata', () => {
      try {
        const target = Math.min(seekTime, Math.max(0, (video.duration || 1) - 0.1));
        video.currentTime = target;
      } catch {
        window.clearTimeout(timeoutId);
        finish(null);
      }
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          window.clearTimeout(timeoutId);
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            window.clearTimeout(timeoutId);
            if (!blob) {
              finish(null);
              return;
            }
            const posterUrl = URL.createObjectURL(blob);
            // Không cleanup video src ngay — poster đã copy pixel, an toàn revoke.
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = null;
            video.remove();
            settled = true;
            resolve({
              posterUrl,
              width: w,
              height: h,
              duration: video.duration || 0,
            });
          },
          'image/jpeg',
          0.82,
        );
      } catch {
        window.clearTimeout(timeoutId);
        finish(null);
      }
    });

    video.addEventListener('error', () => {
      window.clearTimeout(timeoutId);
      finish(null);
    });
  });
}
