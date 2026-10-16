import { describe, expect, it } from 'vitest';
import { createOrUpdateReplayPost } from '../../../supabase/functions/_shared/replayFeedService.ts';

describe('createOrUpdateReplayPost', () => {
  it('updates the current replay post instead of inserting a duplicate', async () => {
    const existingPostId = 'existing-post-id';
    const liveSession = {
      id: 'session-id',
      post_id: existingPostId,
      live_post_id: existingPostId,
      owner_id: 'owner-id',
      title: 'Replay',
      ended_at: '2026-10-14T03:50:24.000Z',
    };
    const existingPost = { user_id: 'owner-id', content: 'Replay', metadata: { replay_status: 'processing' } };
    let updatePayload: Record<string, unknown> | null = null;
    let updateCount = 0;
    let inserted = false;

    const admin = {
      from(table: string) {
        let operation = 'select';
        let payload: Record<string, unknown> | null = null;
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: table === 'live_sessions' ? liveSession : existingPost }),
          update(value: Record<string, unknown>) {
            operation = 'update';
            payload = value;
            return chain;
          },
          insert() {
            inserted = true;
            operation = 'insert';
            return chain;
          },
          then(resolve: (value: unknown) => unknown) {
            if (operation === 'update' && table === 'posts') {
              updatePayload = payload;
              updateCount += 1;
            }
            return Promise.resolve(resolve({ data: null, error: null }));
          },
        };
        return chain;
      },
    };

    const postId = await createOrUpdateReplayPost(admin as any, {
      id: 'replay-id',
      live_session_id: 'session-id',
      user_id: 'owner-id',
      replay_post_id: existingPostId,
      replay_status: 'ready_mp4',
      r2_object_key: 'live-replays/session-id/video.mp4',
      r2_bucket: 'replays',
    }, 'https://media.example/video.mp4');
    const retryPostId = await createOrUpdateReplayPost(admin as any, {
      id: 'replay-id',
      live_session_id: 'session-id',
      user_id: 'owner-id',
      replay_post_id: existingPostId,
      replay_status: 'ready_mp4',
      r2_object_key: 'live-replays/session-id/video.mp4',
      r2_bucket: 'replays',
    }, 'https://media.example/video.mp4');

    expect(postId).toBe(existingPostId);
    expect(retryPostId).toBe(existingPostId);
    expect(inserted).toBe(false);
    expect(updateCount).toBe(2);
    expect(updatePayload).toMatchObject({
      video_url: 'https://media.example/video.mp4',
      replay_ready: true,
      playback_provider: 'r2',
    });
  });

  it('publishes verified R2 media as ready even when the replay row still says processing', async () => {
    const existingPostId = 'existing-post-id';
    const liveSession = {
      id: 'session-id',
      post_id: existingPostId,
      live_post_id: existingPostId,
      owner_id: 'owner-id',
      title: 'Replay',
      ended_at: '2026-10-14T03:50:24.000Z',
    };
    const existingPost = {
      user_id: 'owner-id',
      content: 'Replay',
      metadata: { replay_status: 'processing', archive_status: 'stream_ready' },
    };
    let updatePayload: Record<string, any> | null = null;

    const admin = {
      from(table: string) {
        let operation = 'select';
        let payload: Record<string, any> | null = null;
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: table === 'live_sessions' ? liveSession : existingPost }),
          update(value: Record<string, any>) {
            operation = 'update';
            payload = value;
            return chain;
          },
          then(resolve: (value: unknown) => unknown) {
            if (operation === 'update' && table === 'posts') updatePayload = payload;
            return Promise.resolve(resolve({ data: null, error: null }));
          },
        };
        return chain;
      },
    };

    await createOrUpdateReplayPost(admin as any, {
      id: 'replay-id',
      live_session_id: 'session-id',
      user_id: 'owner-id',
      replay_post_id: existingPostId,
      replay_status: 'processing',
      archive_status: 'stream_ready',
      r2_object_key: 'live-replays/session-id/video.mp4',
      r2_bucket: 'replays',
    }, 'https://media.example/video.mp4');

    expect(updatePayload).toMatchObject({
      replay_status: 'ready_mp4',
      replay_ready: true,
      processing_message: null,
      metadata: {
        replay_status: 'ready_mp4',
        replay_ready: true,
        archive_status: 'r2_ready',
        processing_message: null,
        r2_video_url: 'https://media.example/video.mp4',
      },
    });
  });
});
