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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Verify admin from JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminId = user.id;

    // Admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { user_id: targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Prevent admin from deleting themselves
    if (targetUserId === adminId) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Admin ${adminId} deleting user: ${targetUserId}`);

    const deletionResults: Record<string, string> = {};

    // Delete data in order (respect foreign key constraints)
    // Child tables first, then parent tables
    const tables = [
      // Reactions & likes (leaf tables)
      { table: 'reactions', column: 'user_id' },
      { table: 'comment_likes', column: 'user_id' },
      { table: 'message_reactions', column: 'user_id' },
      { table: 'message_reads', column: 'user_id' },
      { table: 'live_reactions', column: 'user_id' },
      
      // Comments & messages (reference posts/conversations)
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
      { table: 'live_recordings', column: 'live_id', subquery: true, parentTable: 'live_sessions', parentColumn: 'host_user_id' },
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
        if ('subquery' in entry && entry.subquery) {
          // For tables that reference another table's user column
          // e.g., live_recordings -> live_sessions.host_user_id
          const { data: parentIds } = await adminClient
            .from(entry.parentTable!)
            .select('id')
            .eq(entry.parentColumn!, targetUserId);
          
          if (parentIds && parentIds.length > 0) {
            const ids = parentIds.map((r: any) => r.id);
            const { error } = await adminClient.from(entry.table).delete().in('live_id', ids);
            deletionResults[key] = error ? `Error: ${error.message}` : `OK (${ids.length} parents)`;
          } else {
            deletionResults[key] = 'Skip: no parent records';
          }
        } else {
          const { error } = await adminClient.from(entry.table).delete().eq(entry.column, targetUserId);
          deletionResults[key] = error ? `Error: ${error.message}` : 'OK';
        }
      } catch (e) {
        deletionResults[key] = `Skip: ${e instanceof Error ? e.message : 'unknown'}`;
      }
    }

    // Delete messages sent by user (messages.sender_id)
    try {
      const { error } = await adminClient.from('messages').delete().eq('sender_id', targetUserId);
      deletionResults['messages.sender_id'] = error ? `Error: ${error.message}` : 'OK';
    } catch (e) {
      deletionResults['messages.sender_id'] = `Skip: ${e instanceof Error ? e.message : 'unknown'}`;
    }

    // Delete profile
    const { error: profileError } = await adminClient.from('profiles').delete().eq('id', targetUserId);
    deletionResults['profiles'] = profileError ? `Error: ${profileError.message}` : 'OK';

    // Delete auth user
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError);
      return new Response(JSON.stringify({
        error: 'Failed to delete from auth system',
        details: deleteUserError.message,
        deletionResults
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log the action
    await adminClient.from('audit_logs').insert({
      admin_id: adminId,
      action: 'admin_delete_user',
      target_user_id: targetUserId,
      reason: 'Admin deleted user account',
      details: { deletionResults }
    });

    console.log(`Successfully deleted user: ${targetUserId}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'User account deleted successfully',
      deletionResults
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Admin delete user error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
