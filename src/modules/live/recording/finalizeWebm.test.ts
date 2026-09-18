import { describe, expect, it, vi, beforeEach } from 'vitest';

const decoderDecodeMock = vi.fn();
const readerReadMock = vi.fn();
const readerStopMock = vi.fn();
const readerInstance: any = {
  logging: true,
  drop_default_duration: true,
  duration: 12.5,
  metadataSize: 4,
  metadatas: [{ name: 'metadata' }],
  cues: [{ name: 'cue' }],
  read: readerReadMock,
  stop: readerStopMock,
};
const makeMetadataSeekableMock = vi.fn(
  () => new Uint8Array([9, 9, 9, 9]).buffer
);

vi.mock('ts-ebml', () => {
  class Decoder {
    decode(...args: unknown[]) {
      return decoderDecodeMock(...args);
    }
  }
  class Reader {
    logging = readerInstance.logging;
    drop_default_duration = readerInstance.drop_default_duration;
    get duration() {
      return readerInstance.duration;
    }
    get metadataSize() {
      return readerInstance.metadataSize;
    }
    get metadatas() {
      return readerInstance.metadatas;
    }
    get cues() {
      return readerInstance.cues;
    }
    read = readerReadMock;
    stop = readerStopMock;
  }
  return {
    Decoder,
    Reader,
    tools: { makeMetadataSeekable: makeMetadataSeekableMock },
  };
});

beforeEach(() => {
  decoderDecodeMock.mockReset();
  readerReadMock.mockReset();
  readerStopMock.mockReset();
  makeMetadataSeekableMock.mockClear();
  decoderDecodeMock.mockReturnValue([{ name: 'Segment' }]);
  readerInstance.duration = 12.5;
  readerInstance.metadataSize = 4;
});

describe('finalizeWebmDuration', () => {
  it('merges chunks and rewrites seekable metadata', async () => {
    const { finalizeWebmDuration, STREAM_REPLAY_MIME_TYPE } = await import('./finalizeWebm');
    const blob = await finalizeWebmDuration([
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: STREAM_REPLAY_MIME_TYPE }),
      new Blob([new Uint8Array([5, 6])], { type: STREAM_REPLAY_MIME_TYPE }),
    ]);

    expect(blob.type).toBe(STREAM_REPLAY_MIME_TYPE);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 9, 9, 9, 5, 6]);
  });

  it('rejects empty recordings', async () => {
    const { finalizeWebmDuration } = await import('./finalizeWebm');
    await expect(finalizeWebmDuration([])).rejects.toThrow('Video trống');
  });

  it('falls back to raw merged blob when ts-ebml throws (e.g. readVInt)', async () => {
    decoderDecodeMock.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'readVInt')");
    });

    const { finalizeWebmDuration, STREAM_REPLAY_MIME_TYPE } = await import('./finalizeWebm');
    const blob = await finalizeWebmDuration([
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: STREAM_REPLAY_MIME_TYPE }),
      new Blob([new Uint8Array([5, 6])], { type: STREAM_REPLAY_MIME_TYPE }),
    ]);

    expect(blob.type).toBe(STREAM_REPLAY_MIME_TYPE);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
