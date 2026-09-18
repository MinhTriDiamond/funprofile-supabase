import { describe, expect, it } from 'vitest';
import { getPostPlayback } from './postPlaybackResolver';

const basePost = {
  id: 'post-1',
  content: '',
  image_url: null,
  created_at: '2026-06-02T00:00:00.000Z',
  user_id: 'user-1',
  profiles: {
    username: 'angel',
    display_name: 'Angel',
    avatar_url: null,
  },
};

describe('getPostPlayback', () => {
  it('renders live_replay ready when playback_url exists', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live_replay',
      playback_url: 'https://media.fun.rich/replays/1/replay.mp4',
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/1/replay.mp4',
      sourceField: 'post.playback_url',
    });
  });

  it('renders live replay ready when a stale live post has archive_url', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      archive_url: 'https://media.fun.rich/replays/2/replay.mp4',
      metadata: {
        live_status: 'ended',
        archive_status: 'archiving',
      },
    });

    expect(playback.status).toBe('ready');
    expect(playback.type).toBe('live_replay');
    expect(playback.url).toBe('https://media.fun.rich/replays/2/replay.mp4');
  });

  it('renders processing when live replay is archiving without a playable URL', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      metadata: {
        live_status: 'ended',
        archive_status: 'archiving',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'processing',
      url: null,
    });
  });

  it('renders active live when live has no playback URL', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      metadata: {
        live_status: 'live',
      },
    });

    expect(playback).toMatchObject({
      type: 'live',
      status: 'live',
      url: null,
    });
  });

  it('keeps active live ahead of recording and replay processing signals', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      recording_status: 'processing',
      replay_status: 'processing',
      metadata: {
        live_status: 'live',
        recording_status: 'processing',
        replay_status: 'processing',
      },
    }, {
      liveSession: {
        status: 'live',
        host_connection_status: 'online',
        recording_status: 'processing',
      },
      liveReplay: {
        replay_status: 'processing',
        archive_status: 'archiving',
      },
    });

    expect(playback).toMatchObject({
      type: 'live',
      status: 'live',
      url: null,
    });
  });

  it('renders processing only after live has a terminal state and no playable URL', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      recording_status: 'processing',
      replay_status: 'processing',
      metadata: {
        live_status: 'ended',
        recording_status: 'processing',
        replay_status: 'processing',
      },
    }, {
      liveSession: {
        status: 'recording_processing',
        ended_at: '2026-06-02T00:10:00.000Z',
        recording_status: 'processing',
      },
      liveReplay: {
        replay_status: 'processing',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'processing',
      url: null,
    });
  });

  it('normalizes legacy fields and skips Agora webcam temp HLS', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live',
      playback_url: 'https://temp.example.com/replay.m3u8',
      video_url: 'https://media.fun.rich/replays/3/replay.mp4',
      metadata: {
        live_mode: 'agora_webcam',
        recording_provider: 'agora',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/3/replay.mp4',
      sourceField: 'post.video_url',
    });
  });

  it('detects Vietnamese live status text with a replay URL', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'text',
      content: '\u0110ang LIVE tr\u00ean FUN Profile',
      video_url: 'https://media.fun.rich/replays/4/replay.mp4',
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/4/replay.mp4',
    });
  });

  it('keeps live-like posts in processing instead of none when only status text is present', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'text',
      content: 'Dang LIVE tren FUN Profile',
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'processing',
      url: null,
    });
  });

  it('renders ready replay when a text-only live status post has metadata archive URL', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: undefined,
      content: '\u0110ang LIVE tr\u00ean FUN Profile',
      metadata: {
        archive_url: 'https://media.fun.rich/replays/5/replay.mp4',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/5/replay.mp4',
      sourceField: 'metadata.archive_url',
    });
  });

  it('does not treat RTMP Cloudflare temp HLS as ready replay playback', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live_replay',
      video_url: 'https://customer-abc.cloudflarestream.com/abc123/manifest/video.m3u8',
      playback_provider: 'cloudflare_temp',
      replay_ready: true,
      replay_status: 'ready',
      metadata: {
        live_mode: 'rtmp_obs',
        playback_url: 'https://customer-abc.cloudflarestream.com/abc123/manifest/video.m3u8',
        playback_hls: 'https://customer-abc.cloudflarestream.com/abc123/manifest/video.m3u8',
        playback_provider: 'cloudflare_temp',
        storage_provider: 'cloudflare_stream',
        archive_status: 'pending',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'processing',
      url: null,
    });
  });

  it('prefers verified R2 MP4 over RTMP Cloudflare temp HLS', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live_replay',
      video_url: 'https://customer-abc.cloudflarestream.com/abc123/manifest/video.m3u8',
      playback_provider: 'cloudflare_temp',
      metadata: {
        live_mode: 'rtmp_obs',
        playback_url: 'https://customer-abc.cloudflarestream.com/abc123/manifest/video.m3u8',
        archive_mp4_url: 'https://media.fun.rich/replays/user/session/replay.mp4',
        playback_provider: 'cloudflare_temp',
        storage_provider: 'cloudflare_stream',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/user/session/replay.mp4',
      sourceField: 'metadata.archive_mp4_url',
      provider: 'r2',
    });
  });

  it('keeps R2 post.video_url playable even when old RTMP provider metadata is stale', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: 'live_replay',
      video_url: 'https://media.fun.rich/replays/user/session/replay.mp4',
      playback_provider: 'cloudflare_temp',
      metadata: {
        live_mode: 'rtmp_obs',
        playback_provider: 'cloudflare_temp',
        storage_provider: 'cloudflare_stream',
      },
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'ready',
      url: 'https://media.fun.rich/replays/user/session/replay.mp4',
      sourceField: 'post.video_url',
    });
  });

  it('keeps text-only live status posts processing when no URL exists', () => {
    const playback = getPostPlayback({
      ...basePost,
      post_type: undefined,
      content: '\u0110ang LIVE tr\u00ean FUN Profile',
    });

    expect(playback).toMatchObject({
      type: 'live_replay',
      status: 'processing',
      url: null,
    });
  });
});
