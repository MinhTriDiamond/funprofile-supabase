import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAccessToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get access token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // First, try to verify as JWT (fast local verification)
    const jwtPayload = await verifyAccessToken(accessToken);
    
    if (jwtPayload) {
      // JWT signature + expiry are valid. SSO hardening 2026-10-15 (C1+C2):
      // a valid signature is NOT enough — the presented token must match a
      // live, non-revoked row in cross_platform_tokens (so sso-revoke takes
      // effect immediately), and the client binding comes from that exact
      // row / the token's own client_id claim, never from "the user's most
      // recent token" (which could belong to a different platform).
      console.log('[SSO-VERIFY] JWT verified locally for user:', jwtPayload.sub);

      const scopes = jwtPayload.scope || [];

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let tokenQuery = supabase
        .from('cross_platform_tokens')
        .select('id, client_id, last_used_at, access_token_expires_at')
        .eq('user_id', jwtPayload.sub)
        .eq('access_token', accessToken)
        .eq('is_revoked', false);
      if (jwtPayload.client_id) {
        tokenQuery = tokenQuery.eq('client_id', jwtPayload.client_id);
      }
      const { data: tokenData } = await tokenQuery.maybeSingle();

      if (!tokenData) {
        return new Response(
          JSON.stringify({ error: 'invalid_token', error_description: 'Token not found or revoked' }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientId = tokenData.client_id;

      // Build basic response from JWT claims
      const userInfo: Record<string, unknown> = {
        sub: jwtPayload.sub,
        fun_id: jwtPayload.fun_id,
        username: jwtPayload.username,

        active: true,
        token_type: 'jwt'
      };

      // If scopes require additional data, query DB
      const needsDbQuery = scopes.some(s =>
        ['profile', 'email', 'wallet', 'soul', 'rewards', 'platform_data'].includes(s)
      );

      if (needsDbQuery) {
        // Update last_used_at for this exact token row
        await supabase
          .from('cross_platform_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', tokenData.id);

        // Get profile data based on scopes
        const { data: profile } = await supabase
          .from('profiles')
          .select(`
            id, username, full_name, avatar_url, fun_id, bio, created_at,
            wallet_address, external_wallet_address
          `)
          .eq('id', jwtPayload.sub)
          .single();

        if (profile) {
          // Profile scope - extended user info
          if (scopes.includes('profile')) {
            userInfo.full_name = profile.full_name;
            userInfo.avatar_url = profile.avatar_url;
            userInfo.bio = profile.bio;
            userInfo.created_at = profile.created_at;
          }

          // Wallet scope
          if (scopes.includes('wallet')) {
            userInfo.wallet_address = profile.wallet_address;
            userInfo.external_wallet_address = profile.external_wallet_address;
          }

          // Soul scope - NFT/spiritual data
          if (scopes.includes('soul')) {
            const { data: soulNft } = await supabase
              .from('soul_nfts')
              .select('soul_element, soul_level, token_id, minted_at, is_minted')
              .eq('user_id', profile.id)
              .single();
            
            if (soulNft) {
              userInfo.soul_nft = soulNft;
            }
          }

          // Rewards scope
          if (scopes.includes('rewards')) {
            const { data: rewardData } = await supabase
              .from('profiles')
              .select('pending_reward, approved_reward, reward_status, total_rewards')
              .eq('id', profile.id)
              .single();
            
            if (rewardData) {
              userInfo.rewards = rewardData;
            }
          }

          // Platform data scope - only return data for the calling platform
          if (scopes.includes('platform_data') && clientId) {
            const { data: platformData } = await supabase
              .from('platform_user_data')
              .select('data, synced_at, sync_count, last_sync_mode, client_timestamp')
              .eq('user_id', profile.id)
              .eq('client_id', clientId)
              .single();
            
            if (platformData) {
              userInfo.platform_data = platformData;
            } else {
              userInfo.platform_data = null;
            }
          }
        }

        // Token metadata
        userInfo.token_info = {
          client_id: clientId,
          scope: scopes,
          expires_at: tokenData?.access_token_expires_at
        };
      }

      return new Response(
        JSON.stringify(userInfo),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: Check if it's an old opaque token in DB (backward compatibility)
    console.log('[SSO-VERIFY] JWT verification failed, trying DB lookup for opaque token');
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find token in database
    const { data: tokenData, error: tokenError } = await supabase
      .from('cross_platform_tokens')
      .select(`
        *,
        profiles (
          id,
          username,
          full_name,
          avatar_url,
          fun_id,
          bio,
          wallet_address,
          external_wallet_address,
          created_at
        )
      `)
      .eq('access_token', accessToken)
      .eq('is_revoked', false)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'invalid_token', error_description: 'Token not found or revoked' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check token expiration
    if (new Date(tokenData.access_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'invalid_token', error_description: 'Token has expired' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_used_at
    await supabase
      .from('cross_platform_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    const profile = tokenData.profiles;
    const scopes = tokenData.scope || [];
    const clientId = tokenData.client_id;

    // Build response based on scopes (same logic as above)
    const userInfo: Record<string, unknown> = {
      sub: profile.id,
      fun_id: profile.fun_id,
      active: true,
      token_type: 'opaque'
    };

    if (scopes.includes('profile')) {
      userInfo.username = profile.username;
      userInfo.full_name = profile.full_name;
      userInfo.avatar_url = profile.avatar_url;
      userInfo.bio = profile.bio;
      userInfo.created_at = profile.created_at;
    }

    if (scopes.includes('wallet')) {
      userInfo.wallet_address = profile.wallet_address;
      userInfo.external_wallet_address = profile.external_wallet_address;
    }

    if (scopes.includes('soul')) {
      const { data: soulNft } = await supabase
        .from('soul_nfts')
        .select('soul_element, soul_level, token_id, minted_at, is_minted')
        .eq('user_id', profile.id)
        .single();
      
      if (soulNft) {
        userInfo.soul_nft = soulNft;
      }
    }

    if (scopes.includes('rewards')) {
      const { data: rewardData } = await supabase
        .from('profiles')
        .select('pending_reward, approved_reward, reward_status, total_rewards')
        .eq('id', profile.id)
        .single();
      
      if (rewardData) {
        userInfo.rewards = rewardData;
      }
    }

    if (scopes.includes('platform_data')) {
      const { data: platformData } = await supabase
        .from('platform_user_data')
        .select('data, synced_at, sync_count, last_sync_mode, client_timestamp')
        .eq('user_id', profile.id)
        .eq('client_id', clientId)
        .single();
      
      if (platformData) {
        userInfo.platform_data = platformData;
      } else {
        userInfo.platform_data = null;
      }
    }

    userInfo.token_info = {
      client_id: clientId,
      scope: scopes,
      expires_at: tokenData.access_token_expires_at
    };

    return new Response(
      JSON.stringify(userInfo),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('SSO Verify error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
