import { describe, expect, it } from 'vitest';
import { POST_DETAIL_SELECT } from './postDetailQuery';

describe('post detail live data query', () => {
  it('loads live identity and replay fields needed by the feed card', () => {
    expect(POST_DETAIL_SELECT).toMatch(/\bpost_type\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\bmetadata\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\breplay_status\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\breplay_ready\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\bplayback_provider\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\bprocessing_message\b/);
  });

  it('loads profile live state used by the post header badge', () => {
    expect(POST_DETAIL_SELECT).toMatch(/\bis_live\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\bcurrent_live_session_id\b/);
    expect(POST_DETAIL_SELECT).toMatch(/\blive_started_at\b/);
  });
});
