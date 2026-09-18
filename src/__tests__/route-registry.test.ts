/**
 * Route Registry — validation invariants (Navigation Framework v1.0 — B1).
 */
import { describe, it, expect } from 'vitest';
import { ROUTE_REGISTRY, type RouteEntry } from '@/config/routeRegistry';

const LAYOUTS = new Set(['normal', 'fullscreen', 'admin', 'publicOnly']);
const AUTHS = new Set(['guest', 'user', 'admin', 'founder']);
const DOMAINS = new Set([
  'social', 'finance', 'identity', 'creator', 'game', 'governance', 'admin', 'system',
]);

describe('routeRegistry — invariants', () => {
  it('mỗi entry có layout hợp lệ', () => {
    for (const r of ROUTE_REGISTRY) {
      expect(LAYOUTS.has(r.layout), `layout invalid at ${r.path}`).toBe(true);
    }
  });

  it('mỗi entry có auth hợp lệ', () => {
    for (const r of ROUTE_REGISTRY) {
      expect(AUTHS.has(r.auth), `auth invalid at ${r.path}`).toBe(true);
    }
  });

  it('mỗi entry có domain hợp lệ', () => {
    for (const r of ROUTE_REGISTRY) {
      expect(DOMAINS.has(r.domain), `domain invalid at ${r.path}`).toBe(true);
    }
  });

  it('publicOnly ⇒ auth = guest', () => {
    for (const r of ROUTE_REGISTRY) {
      if (r.layout === 'publicOnly') {
        expect(r.auth, `${r.path} publicOnly must be guest`).toBe('guest');
      }
    }
  });

  it('layout admin ⇒ auth ∈ {admin, founder}', () => {
    for (const r of ROUTE_REGISTRY) {
      if (r.layout === 'admin') {
        expect(['admin', 'founder']).toContain(r.auth);
      }
    }
  });

  it(':username là entry cuối cùng', () => {
    const last = ROUTE_REGISTRY[ROUTE_REGISTRY.length - 1];
    expect(last.path).toBe(':username');
  });

  it(':username xuất hiện đúng 1 lần', () => {
    const count = ROUTE_REGISTRY.filter((r) => r.path === ':username').length;
    expect(count).toBe(1);
  });

  it('không có path trùng', () => {
    const seen = new Map<string, RouteEntry>();
    for (const r of ROUTE_REGISTRY) {
      expect(seen.has(r.path), `duplicate path ${r.path}`).toBe(false);
      seen.set(r.path, r);
    }
  });

  it('mọi parent trỏ tới path tồn tại trong registry', () => {
    const paths = new Set(ROUTE_REGISTRY.map((r) => r.path));
    for (const r of ROUTE_REGISTRY) {
      if (!r.parent) continue;
      expect(paths.has(r.parent), `${r.path}.parent=${r.parent} not found`).toBe(true);
    }
  });

  it('không entry nào tự làm parent của chính mình', () => {
    for (const r of ROUTE_REGISTRY) {
      if (r.parent) expect(r.parent).not.toBe(r.path);
    }
  });
});
