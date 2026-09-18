import { describe, expect, it } from 'vitest';

const MODULE_PATH = '../../supabase/functions/_shared/walletTopicBatches.ts';
// deno-lint-ignore no-explicit-any
const mod: any = await import(/* @vite-ignore */ MODULE_PATH);
const { chunkTopics, addressToTopic, scanSegmentAllBatches, WALLET_TOPIC_BATCH_SIZE } = mod;

const fakeWallets = (n: number) =>
  Array.from({ length: n }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0'));

describe('chia lô ví theo trần topics', () => {
  it('1.014 ví → lô ≤ 400, không lô nào vượt trần', () => {
    const topics = fakeWallets(1014).map(addressToTopic);
    const batches = chunkTopics(topics, WALLET_TOPIC_BATCH_SIZE);
    expect(WALLET_TOPIC_BATCH_SIZE).toBeLessThanOrEqual(400);
    expect(batches.length).toBe(3);
    expect(Math.max(...batches.map((b: string[]) => b.length))).toBeLessThanOrEqual(400);
    expect(batches.flat().length).toBe(1014);
    expect(topics[0]).toHaveLength(66);
  });

  it('mọi lô thành công → advance tới hết khoảng, log gộp đủ', async () => {
    const batches = chunkTopics(fakeWallets(1014).map(addressToTopic), 400);
    const seen: number[] = [];
    const res = await scanSegmentAllBatches(batches, 100, 199, async (b: string[], f: number, t: number) => {
      seen.push(b.length);
      return { logs: [{ blockNumber: '0x64', batch: b.length, f, t }], to: t };
    });
    expect(seen).toEqual([400, 400, 214]);
    expect(res.reached).toBe(199);
    expect(res.logs).toHaveLength(3);
  });

  it('1 lô lỗi giữa các lô thành công → KHÔNG advance watermark', async () => {
    const batches = chunkTopics(fakeWallets(1000).map(addressToTopic), 400);
    let call = 0;
    const res = await scanSegmentAllBatches(batches, 100, 199, async () => {
      call++;
      if (call === 2) return null; // lô 2 lỗi (exceed max topics / endpoint chết)
      return { logs: [{ blockNumber: '0x64' }], to: 199 };
    });
    expect(res.reached).toBeNull();
    expect(res.logs).toHaveLength(0);
  });

  it('lô bị endpoint cắt span ngắn hơn → reached = min(to), bỏ log vượt mốc', async () => {
    const batches = chunkTopics(fakeWallets(800).map(addressToTopic), 400);
    let call = 0;
    const res = await scanSegmentAllBatches(batches, 100, 199, async () => {
      call++;
      return call === 1
        ? { logs: [{ blockNumber: '0x96' }], to: 199 } // block 150
        : { logs: [{ blockNumber: '0x82' }], to: 130 }; // block 130
    });
    expect(res.reached).toBe(130);
    expect(res.logs).toHaveLength(1);
    expect(res.logs[0].blockNumber).toBe('0x82');
  });
});
