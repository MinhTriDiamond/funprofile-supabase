import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function deleteUserData(adminClient: any, userId: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Delete in order to respect foreign key constraints (same as delete-user-account)
  const tables = [
    { table: 'message_reactions', column: 'user_id' },
    { table: 'message_reads', column: 'user_id' },
    { table: 'live_comments', column: 'user_id' },
    { table: 'live_messages', column: 'user_id' },
    { table: 'live_reactions', column: 'user_id' },
    { table: 'call_participants', column: 'user_id' },
    { table: 'reactions', column: 'user_id' },
    { table: 'comments', column: 'user_id' },
    { table: 'shared_posts', column: 'user_id' },
    { table: 'posts', column: 'user_id' },
    { table: 'friendships', column: 'user_id' },
    { table: 'friendships', column: 'friend_id' },
    { table: 'notifications', column: 'user_id' },
    { table: 'notifications', column: 'actor_id' },
    { table: 'reward_claims', column: 'user_id' },
    { table: 'reward_approvals', column: 'user_id' },
    { table: 'reward_adjustments', column: 'user_id' },
    { table: 'search_logs', column: 'user_id' },
    { table: 'soul_nfts', column: 'user_id' },
    { table: 'light_actions', column: 'user_id' },
    { table: 'light_actions', column: 'actor_id' },
    { table: 'light_reputation', column: 'user_id' },
    { table: 'fun_distribution_logs', column: 'actor_id' },
    { table: 'donations', column: 'sender_id' },
    { table: 'donations', column: 'recipient_id' },
    { table: 'crypto_gifts', column: 'from_user_id' },
    { table: 'crypto_gifts', column: 'to_user_id' },
    { table: 'conversation_participants', column: 'user_id' },
    { table: 'messages', column: 'sender_id' },
    
    { table: 'transactions', column: 'user_id' },
    { table: 'cross_platform_tokens', column: 'user_id' },
    { table: 'login_ip_logs', column: 'user_id' },
    { table: 'chat_settings', column: 'user_id' },
    { table: 'blacklisted_wallets', column: 'user_id' },
    { table: 'user_roles', column: 'user_id' },
    { table: 'livestreams', column: 'user_id' },
  ];

  for (const { table, column } of tables) {
    const { error } = await adminClient.from(table).delete().eq(column, userId);
    const key = `${table}.${column}`;
    results[key] = error ? `Error: ${error.message}` : 'OK';
  }

  // Delete live_sessions (has owner_id and host_user_id)
  await adminClient.from('live_sessions').delete().eq('owner_id', userId);
  await adminClient.from('live_sessions').delete().eq('host_user_id', userId);

  // Delete profile last
  const { error: profileError } = await adminClient.from('profiles').delete().eq('id', userId);
  results['profiles'] = profileError ? `Error: ${profileError.message}` : 'OK';

  return results;
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all banned users
    const { data: bannedUsers, error: queryError } = await adminClient
      .from('profiles')
      .select('id, username')
      .eq('is_banned', true);

    if (queryError) {
      throw queryError;
    }

    if (!bannedUsers || bannedUsers.length === 0) {
      return new Response(JSON.stringify({
        total_banned: 0,
        deleted: 0,
        errors: [],
        message: 'Không có user bị ban nào để xoá',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${bannedUsers.length} banned users to delete`);

    const errors: Array<{ userId: string; username: string; error: string }> = [];
    let deleted = 0;

    for (const bannedUser of bannedUsers) {
      // Skip the admin performing the action
      if (bannedUser.id === user.id) {
        console.log(`Skipping self (admin): ${bannedUser.id}`);
        continue;
      }

      try {
        console.log(`Deleting banned user: ${bannedUser.id} (${bannedUser.username})`);
        
        // Delete all user data from tables
        const tableResults = await deleteUserData(adminClient, bannedUser.id);
        console.log(`Table deletion results for ${bannedUser.id}:`, tableResults);

        // Delete from auth.users
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(bannedUser.id);
        if (deleteAuthError) {
          errors.push({
            userId: bannedUser.id,
            username: bannedUser.username || 'unknown',
            error: `Auth delete failed: ${deleteAuthError.message}`,
          });
          continue;
        }

        // Log audit
        await adminClient.from('audit_logs').insert({
          admin_id: user.id,
          action: 'batch_delete_banned_user',
          target_user_id: bannedUser.id,
          reason: 'Batch deletion of banned users',
          details: { username: bannedUser.username },
        });

        deleted++;
      } catch (err: any) {
        errors.push({
          userId: bannedUser.id,
          username: bannedUser.username || 'unknown',
          error: err.message || 'Unknown error',
        });
      }
    }

    console.log(`Batch delete complete: ${deleted} deleted, ${errors.length} errors`);

    return new Response(JSON.stringify({
      total_banned: bannedUsers.length,
      deleted,
      errors,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Batch delete error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
