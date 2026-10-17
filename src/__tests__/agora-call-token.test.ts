import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/agora-call-token/index.ts'), 'utf8');
const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
const globalCalls = readFileSync(resolve(process.cwd(), 'src/contexts/CallContext.tsx'), 'utf8');
describe('Agora call token endpoint contract', () => {
  it('authenticates and derives channel/UID from the call context RPC', () => {
    expect(edge).toContain('requireUser(req)');
    expect(edge).toContain("rpc('get_agora_call_token_context'");
    expect(edge).toContain('call_session_id');
    expect(edge).not.toContain('channel_name:');
    expect(edge).toContain('RtcRole.PUBLISHER');
  });
  it('handles CORS in the function and sets only function-scoped JWT config', () => {
    expect(edge).toContain("req.method === 'OPTIONS'");
    expect(config).toMatch(/\[functions\.agora-call-token\]\s+verify_jwt = false/);
  });
  it('routes global incoming-call decline through the conditional RPC', () => {
    expect(globalCalls).toContain('chatRpc.declineCallSession(incomingCall.id)');
    expect(globalCalls).not.toMatch(/from\('call_sessions'\)[\s\S]*?\.update\(/);
    expect(globalCalls).toMatch(/\['active', 'ended', 'declined', 'missed'\]/);
  });
});
