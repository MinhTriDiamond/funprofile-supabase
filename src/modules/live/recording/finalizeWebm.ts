// Polyfill Buffer cho ts-ebml chạy trong browser
import { Buffer } from 'buffer';
if (typeof globalThis !== 'undefined' && !(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

export const STREAM_REPLAY_MIME_TYPE = 'video/webm;codecs=vp8,opus';

/**
 * Ghép các chunk MediaRecorder thành 1 WebM duy nhất, đồng thời cố gắng
 * vá metadata duration/seekable bằng `ts-ebml` (load động để tránh
 * `require is not defined` khi Rollup tách chunk CJS).
 *
 * Nếu ts-ebml lỗi (browser bundle thiếu polyfill, hoặc CJS không evaluate
 * được), ta KHÔNG ném exception — trả về WebM ghép thô để Cloudflare Stream
 * vẫn xử lý replay được, tránh crash UI host live.
 */
export async function finalizeWebmDuration(
  chunks: Blob[],
  mimeType = STREAM_REPLAY_MIME_TYPE
): Promise<Blob> {
  const nonEmptyChunks = chunks.filter((chunk) => chunk.size > 0);
  if (nonEmptyChunks.length === 0) {
    throw new Error('Video trống, không thể tạo replay.');
  }

  const source = new Blob(nonEmptyChunks, { type: mimeType });

  try {
    const { Decoder, Reader, tools } = await import('ts-ebml');
    const buffer = await source.arrayBuffer();
    const decoder = new Decoder();
    const reader = new Reader();
    reader.logging = false;
    reader.drop_default_duration = false;

    const elements = decoder.decode(buffer);
    for (const element of elements) reader.read(element);
    reader.stop();

    if (!reader.duration || !Number.isFinite(reader.duration) || reader.duration <= 0) {
      return source;
    }

    const metadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
    const body = buffer.slice(reader.metadataSize);
    return new Blob([metadata, body], { type: mimeType });
  } catch (err) {
    console.warn(
      '[finalizeWebmDuration] EBML metadata repair thất bại, fallback raw blob:',
      err
    );
    return source;
  }
}
