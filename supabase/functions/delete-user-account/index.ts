import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Verify user from JWT token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;
    console.log(`Starting account deletion for user: ${userId}`);

    // Admin client to delete data and user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete data in order (respect foreign key constraints)
    const deletionResults: Record<string, string> = {};

    const tables = [
      // Reactions & likes (leaf tables)
      { table: 'reactions', column: 'user_id' },
      { table: 'comment_likes', column: 'user_id' },
      { table: 'message_reactions', column: 'user_id' },
      { table: 'message_reads', column: 'user_id' },
      { table: 'live_reactions', column: 'user_id' },

      // Comments & messages
      { table: 'comments', column: 'user_id' },
      { table: 'live_comments', column: 'user_id' },
      { table: 'live_messages', column: 'user_id' },

      // Posts & shares
      { table: 'shared_posts', column: 'user_id' },
      { table: 'posts', column: 'user_id' },

      // Social
      { table: 'friendships', column: 'user_id' },
      { table: 'friendships', column: 'friend_id' },
      { table: 'notifications', column: 'user_id' },
      { table: 'notifications', column: 'actor_id' },

      // Rewards & finance
      { table: 'reward_claims', column: 'user_id' },
      { table: 'reward_approvals', column: 'user_id' },
      { table: 'reward_adjustments', column: 'user_id' },
      { table: 'transactions', column: 'user_id' },
      { table: 'financial_transactions', column: 'user_id' },
      { table: 'platform_financial_data', column: 'user_id' },
      { table: 'platform_user_data', column: 'user_id' },

      // Donations (both sides)
      { table: 'donations', column: 'sender_id' },
      { table: 'donations', column: 'recipient_id' },

      // Crypto & wallets
      { table: 'crypto_gifts', column: 'from_user_id' },
      { table: 'crypto_gifts', column: 'to_user_id' },
      
      { table: 'blacklisted_wallets', column: 'user_id' },

      // Light system
      { table: 'fun_distribution_logs', column: 'actor_id' },
      { table: 'light_actions', column: 'user_id' },
      { table: 'light_actions', column: 'actor_id' },
      { table: 'light_reputation', column: 'user_id' },
      { table: 'soul_nfts', column: 'user_id' },

      // Live & calls
      { table: 'call_participants', column: 'user_id' },
      { table: 'live_sessions', column: 'host_user_id' },
      { table: 'live_sessions', column: 'owner_id' },
      { table: 'livestreams', column: 'user_id' },

      // Chat
      { table: 'chat_settings', column: 'user_id' },
      { table: 'conversation_participants', column: 'user_id' },

      // Auth & security
      { table: 'cross_platform_tokens', column: 'user_id' },
      { table: 'login_ip_logs', column: 'user_id' },
      { table: 'search_logs', column: 'user_id' },
      { table: 'audit_logs', column: 'target_user_id' },
      { table: 'user_roles', column: 'user_id' },
      { table: 'username_history', column: 'user_id' },
    ];

    for (const entry of tables) {
      const key = `${entry.table}.${entry.column}`;
      try {
        const { error } = await adminClient.from(entry.table).delete().eq(entry.column, userId);
        deletionResults[key] = error ? `Error: ${error.message}` : 'OK';
      } catch (e) {
        deletionResults[key] = `Skip: ${e instanceof Error ? e.message : 'unknown'}`;
      }
    }

    // Delete messages sent by user
    try {
      const { error } = await adminClient.from('messages').delete().eq('sender_id', userId);
      deletionResults['messages.sender_id'] = error ? `Error: ${error.message}` : 'OK';
    } catch (e) {
      deletionResults['messages.sender_id'] = `Skip: ${e instanceof Error ? e.message : 'unknown'}`;
    }

    // Profile (must be last before auth user)
    const { error: profilesError } = await adminClient.from('profiles').delete().eq('id', userId);
    deletionResults['profiles'] = profilesError ? `Error: ${profilesError.message}` : 'OK';

    console.log('Deletion results:', deletionResults);

    // Finally: Delete user from auth.users
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError);
      return new Response(JSON.stringify({ 
        error: 'Failed to delete account from auth system',
        details: deleteUserError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Account deleted successfully',
      deletionResults
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Delete account error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
