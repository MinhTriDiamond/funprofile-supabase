/**
 * Video compression utility using browser Canvas API
 * Used by LiveHostPage for compressing recorded video before upload
 */

interface CompressOptions {
  onProgress?: (percent: number) => void;
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: number;
}

/**
 * Compress a video blob using MediaRecorder re-encoding
 * Falls back to original blob if compression fails
 */
export async function compressVideo(
  blob: Blob,
  options: CompressOptions = {}
): Promise<Blob> {
  const { onProgress, videoBitrate = 2_500_000 } = options;

  // If blob is already small enough (<10MB), skip compression
  if (blob.size < 10 * 1024 * 1024) {
    onProgress?.(100);
    return blob;
  }

  try {
    const videoUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video for compression'));
      setTimeout(() => reject(new Error('Video load timeout')), 10000);
    });

    // Check if MediaRecorder supports re-encoding
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;

    const stream = canvas.captureStream(30);
    
    // Add audio track if exists
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    recorder.start(1000);
    video.currentTime = 0;
    await video.play();

    // Progress tracking
    const duration = video.duration;
    const progressInterval = setInterval(() => {
      if (duration > 0) {
        onProgress?.(Math.min(95, Math.round((video.currentTime / duration) * 100)));
      }
    }, 500);

    // Draw frames
    const drawFrame = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0);
      requestAnimationFrame(drawFrame);
    };
    drawFrame();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    clearInterval(progressInterval);
    recorder.stop();
    source.disconnect();
    audioCtx.close();
    URL.revokeObjectURL(videoUrl);

    const result = await done;
    onProgress?.(100);
    return result;
  } catch (err) {
    console.warn('[videoCompression] Compression failed, using original:', err);
    onProgress?.(100);
    return blob;
  }
}
