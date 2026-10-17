import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261017111000_chat_message_access.sql'), 'utf8');
describe('chat message authorization contract', () => {
  it('requires active membership, sender ownership and same-conversation replies', () => {
    expect(sql).toMatch(/CREATE POLICY "Members send messages"[\s\S]*?sender_id\s*=\s*auth\.uid\(\)[\s\S]*?can_message_conversation/i);
    expect(sql).toMatch(/reply_to_id\s+IS NULL[\s\S]*?reply_to_id[\s\S]*?conversation_id\s*=\s*messages\.conversation_id/i);
    expect(sql).toMatch(/CREATE POLICY "Active senders update messages"[\s\S]*?sender_id\s*=\s*auth\.uid\(\)[\s\S]*?can_message_conversation/i);
  });
  it('checks direct-message blocks without allowing block-list enumeration', () => {
    expect(sql).toMatch(/FUNCTION public\.can_message_conversation\(uuid\)/i);
    expect(sql).toMatch(/has_block_between\(auth\.uid\(\),\s*other_member\.user_id\)/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.can_message_conversation\(uuid\) FROM PUBLIC, anon/i);
  });
});
