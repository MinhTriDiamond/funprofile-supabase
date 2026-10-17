import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261017110000_chat_security_realtime.sql'), 'utf8');

describe('chat conversation security migration contract', () => {
  it('exposes only actor-derived atomic conversation and membership RPCs', () => {
    for (const name of ['create_direct_conversation', 'create_group_conversation', 'manage_conversation_member', 'leave_conversation', 'get_my_block_relationships']) {
      expect(migration).toMatch(new RegExp(`FUNCTION public\\.${name}\\(`, 'i'));
    }
    expect(migration).toMatch(/auth\.uid\(\)/i);
    expect(migration).toMatch(/SET search_path TO pg_catalog, public, pg_temp/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_direct_conversation\(uuid\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_direct_conversation\(uuid\) FROM PUBLIC, anon/i);
  });

  it('removes malformed self-comparison policies and preserves publication members', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can view conversations they are part of"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can add participants to conversations"');
    expect(migration).toMatch(/pg_publication_tables[\s\S]*?ALTER PUBLICATION supabase_realtime ADD TABLE/i);
    expect(migration).not.toMatch(/DROP PUBLICATION|ALTER PUBLICATION supabase_realtime DROP TABLE/i);
    expect(migration).not.toMatch(/conversation_participants_1\.conversation_id\s*=\s*conversation_participants_1\.conversation_id/i);
  });
});
