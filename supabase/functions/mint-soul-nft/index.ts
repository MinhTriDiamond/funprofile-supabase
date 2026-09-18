import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Soul elements with descriptions (ASCII-safe for btoa)
const SOUL_ELEMENTS: Record<string, { color: string; trait: string }> = {
  'Kim': { color: '#FFD700', trait: 'Decisive & Strong' },
  'Moc': { color: '#228B22', trait: 'Creative & Growth' },
  'Thuy': { color: '#1E90FF', trait: 'Flexible & Wise' },
  'Hoa': { color: '#FF4500', trait: 'Passionate & Energetic' },
  'Tho': { color: '#8B4513', trait: 'Stable & Reliable' }
};

// Safe base64 encode for Unicode strings
function safeBase64Encode(str: string): string {
  // Encode to UTF-8 bytes, then to base64
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify JWT token - SECURITY FIX
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[MINT-SOUL-NFT] Missing authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Create client with anon key to verify user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('[MINT-SOUL-NFT] Unauthorized:', userError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check banned status
    const supabaseServiceKey_ban = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const banCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, supabaseServiceKey_ban);
    const { data: banCheck } = await banCheckClient
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tài khoản đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Use authenticated user's ID (not from request body) - SECURITY FIX
    const user_id = user.id;
    
    // Parse optional soul_name from request
    let soul_name: string | undefined;
    try {
      const body = await req.json();
      soul_name = body.soul_name;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[MINT-SOUL-NFT] Authenticated request for user: ${user_id}`);

    // Create Supabase client with service role for privileged operations
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user profile and existing soul NFT
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, fun_id, wallet_address, reward_locked')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      console.error('[MINT-SOUL-NFT] User not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Check reward_locked (wallet-first accounts before email verification)
    if (profile.reward_locked === true) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Reward Locked',
          message: 'Vui lòng liên kết và xác thực email để mở khóa tính năng mint.',
          action: 'link_email',
          redirect: '/settings/security'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has a wallet
    if (!profile.wallet_address) {
      console.error('[MINT-SOUL-NFT] User has no wallet address');
      return new Response(
        JSON.stringify({ success: false, error: 'User must have a wallet to mint Soul NFT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing soul NFT record
    const { data: soulNft, error: soulError } = await supabase
      .from('soul_nfts')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (soulError && soulError.code !== 'PGRST116') {
      console.error('[MINT-SOUL-NFT] Error fetching soul NFT:', soulError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch soul data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already minted
    if (soulNft?.is_minted) {
      console.log('[MINT-SOUL-NFT] Soul NFT already minted');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Soul NFT already minted',
          soul_nft: {
            token_id: soulNft.token_id,
            soul_name: soulNft.soul_name,
            soul_element: soulNft.soul_element,
            soul_level: soulNft.soul_level,
            contract_address: soulNft.contract_address,
            metadata_uri: soulNft.metadata_uri
          },
          is_new: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate token ID (timestamp + random)
    const tokenId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Determine soul name (use provided or generate from FUN-ID)
    // Convert Vietnamese to ASCII-safe version for metadata
    const finalSoulName = soul_name || profile.fun_id || profile.username || 'Anonymous';
    
    // Get soul element (should already be set by trigger, but fallback)
    // Normalize Vietnamese element names to ASCII
    const rawElement = soulNft?.soul_element || Object.keys(SOUL_ELEMENTS)[Math.floor(Math.random() * 5)];
    const elementMap: Record<string, string> = {
      'Kim': 'Kim', 'Mộc': 'Moc', 'Thủy': 'Thuy', 'Hỏa': 'Hoa', 'Thổ': 'Tho'
    };
    const soulElement = elementMap[rawElement] || rawElement;
    const elementData = SOUL_ELEMENTS[soulElement] || SOUL_ELEMENTS['Kim'];

    // Generate metadata URI (in production, upload to IPFS)
    // Use ASCII-safe strings for base64 encoding
    const metadata = {
      name: `Soul of ${finalSoulName}`,
      description: `FUN Identity Soul NFT - Element: ${soulElement} - ${elementData.trait}`,
      image: `https://api.dicebear.com/7.x/identicon/svg?seed=${user_id}`,
      attributes: [
        { trait_type: 'FUN-ID', value: profile.fun_id || 'N/A' },
        { trait_type: 'Element', value: soulElement },
        { trait_type: 'Element Color', value: elementData.color },
        { trait_type: 'Element Trait', value: elementData.trait },
        { trait_type: 'Soul Level', value: soulNft?.soul_level || 1 },
        { trait_type: 'Experience Points', value: soulNft?.experience_points || 0 }
      ],
      external_url: `https://fun.rich/${profile.fun_id || user_id}`
    };

    // Use safe base64 encoding
    const metadataUri = `data:application/json;base64,${safeBase64Encode(JSON.stringify(metadata))}`;

    // For now, simulate minting (in production, interact with smart contract)
    const contractAddress = '0x0000000000000000000000000000000000000000'; // Placeholder

    console.log('[MINT-SOUL-NFT] Minting soul NFT with token ID:', tokenId);

    // Update soul NFT record
    if (soulNft) {
      const { error: updateError } = await supabase
        .from('soul_nfts')
        .update({
          token_id: tokenId,
          soul_name: finalSoulName,
          soul_element: soulElement,
          contract_address: contractAddress,
          metadata_uri: metadataUri,
          is_minted: true,
          minted_at: new Date().toISOString()
        })
        .eq('id', soulNft.id);

      if (updateError) {
        console.error('[MINT-SOUL-NFT] Failed to update soul NFT:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to mint soul NFT' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Create new soul NFT record
      const { error: insertError } = await supabase
        .from('soul_nfts')
        .insert({
          user_id,
          token_id: tokenId,
          soul_name: finalSoulName,
          soul_element: soulElement,
          contract_address: contractAddress,
          metadata_uri: metadataUri,
          is_minted: true,
          minted_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('[MINT-SOUL-NFT] Failed to create soul NFT:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to mint soul NFT' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[MINT-SOUL-NFT] Soul NFT minted successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Soul NFT minted successfully',
        soul_nft: {
          token_id: tokenId,
          soul_name: finalSoulName,
          soul_element: soulElement,
          soul_level: soulNft?.soul_level || 1,
          experience_points: soulNft?.experience_points || 0,
          contract_address: contractAddress,
          metadata_uri: metadataUri,
          element_trait: elementData.trait,
          element_color: elementData.color
        },
        is_new: true,
        profile_url: `https://fun.rich/${profile.fun_id || user_id}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MINT-SOUL-NFT] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
