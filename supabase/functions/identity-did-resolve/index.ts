// W3C DID Resolver — public endpoint
// Trả về DID Document chuẩn W3C cho mọi did:fun:* (kể cả org/validator/ai-agent)
// Spec: https://www.w3.org/TR/did-core/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Lấy DID từ query (?did=did:fun:xxx) hoặc body
    const url = new URL(req.url);
    let did_id = url.searchParams.get('did');
    if (!did_id && req.method === 'POST') {
      try { const body = await req.json(); did_id = body?.did; } catch {}
    }
    if (!did_id || !did_id.startsWith('did:fun:')) {
      return j({ error: 'invalid did. Expect did:fun:*' }, 400);
    }

    const { data: did, error } = await supabase.from('did_registry')
      .select('did_id, did_level, status, entity_type, created_at, updated_at')
      .eq('did_id', did_id).maybeSingle();
    if (error) throw error;
    if (!did) return j({ error: 'did not found', didResolutionMetadata: { error: 'notFound' } }, 404);

    // Trust profile (public summary)
    const { data: trust } = await supabase.from('trust_profile')
      .select('tc, trust_tier, sybil_risk').eq('did_id', did_id).maybeSingle();

    // Verified links (public)
    const { data: links } = await supabase.from('identity_links')
      .select('link_type, link_value, verified_at')
      .eq('did_id', did_id).eq('verification_state', 'verified');

    // SBT public
    const { data: sbts } = await supabase.from('sbt_registry')
      .select('token_id, sbt_category, sbt_type, issued_at, trust_weight')
      .eq('did_id', did_id).eq('status', 'active').eq('privacy_level', 'public');

    // Build verificationMethod từ wallet links
    const verificationMethod = (links ?? [])
      .filter((l: any) => l.link_type === 'wallet')
      .map((l: any, i: number) => ({
        id: `${did_id}#wallet-${i}`,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: did_id,
        blockchainAccountId: `eip155:56:${l.link_value}`,
      }));

    // Service endpoints — trust + reputation
    const baseUrl = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.functions.supabase.co');
    const service = [
      {
        id: `${did_id}#trust-profile`,
        type: 'FunTrustProfile',
        serviceEndpoint: `${baseUrl}/identity-did-resolve?did=${did_id}`,
      },
    ];

    // DID Document chuẩn W3C
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
      ],
      id: did_id,
      controller: did_id,
      verificationMethod,
      authentication: verificationMethod.map((v: any) => v.id),
      service,
    };

    // FUN-specific extensions (namespace riêng)
    const funMetadata = {
      did_level: did.did_level,
      status: did.status,
      entity_type: did.entity_type,
      created_at: did.created_at,
      updated_at: did.updated_at,
      trust: trust ? {
        tc: Number(trust.tc),
        tier: trust.trust_tier,
        sybil_risk: trust.sybil_risk,
      } : null,
      sbts: (sbts ?? []).map((s: any) => ({
        id: s.token_id,
        category: s.sbt_category,
        type: s.sbt_type,
        issued_at: s.issued_at,
        weight: Number(s.trust_weight),
      })),
      links: (links ?? []).map((l: any) => ({
        type: l.link_type,
        value: l.link_value,
        verified_at: l.verified_at,
      })),
    };

    return j({
      didDocument,
      didResolutionMetadata: {
        contentType: 'application/did+ld+json',
        retrieved: new Date().toISOString(),
        resolver: 'fun-did-resolver/1.0',
      },
      didDocumentMetadata: {
        created: did.created_at,
        updated: did.updated_at,
      },
      funExtension: funMetadata,
    });
  } catch (e: any) {
    return j({ error: e.message }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...corsHeaders },
  });
}
