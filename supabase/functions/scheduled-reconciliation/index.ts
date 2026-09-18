import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Scheduled Reconciliation Edge Function
 * 
 * This function runs financial reconciliation to detect discrepancies
 * between aggregated totals and transaction logs.
 * 
 * Can be triggered:
 * 1. By cron job (scheduled)
 * 2. Manually by Admin from dashboard
 * 
 * Reconciliation Levels:
 * - Level 1 (< 0.01%): Auto-adjustment, minor rounding errors
 * - Level 2 (< 1%): Needs manual review, sync issues
 * - Level 3 (> 1%): Critical - possible fraud or serious bug
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Optional: Check if called by admin (for manual trigger)
    let adminId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      
      if (user) {
        // Verify admin role
        const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });
        
        if (hasAdminRole) {
          adminId = user.id;
        }
      }
    }

    console.log(`Running financial reconciliation${adminId ? ` (triggered by admin: ${adminId})` : ' (scheduled)'}`);

    // Run reconciliation
    const { data: result, error: reconcileError } = await supabaseAdmin.rpc(
      'run_financial_reconciliation',
      // p_dry_run: false — giữ hành vi cũ (có ghi điều chỉnh).
      // LƯU Ý: RPC nay yêu cầu auth.uid() là admin, nên đường service_role sẽ bị chặn.
      { p_admin_id: adminId, p_dry_run: false }
    );

    if (reconcileError) {
      console.error("Reconciliation error:", reconcileError);
      throw reconcileError;
    }

    console.log("Reconciliation result:", JSON.stringify(result, null, 2));

    // If critical issues found, create admin notifications
    if (result?.level === 3 || result?.status === 'critical') {
      console.log("Critical discrepancies found! Creating admin notifications...");
      
      // Get all admin users
      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        // Create notification for each admin
        const notifications = adminRoles.map(admin => ({
          user_id: admin.user_id,
          actor_id: admin.user_id, // Self-notification from system
          type: 'financial_alert',
          post_id: null
        }));

        const { error: notifyError } = await supabaseAdmin
          .from('notifications')
          .insert(notifications);

        if (notifyError) {
          console.error("Failed to create admin notifications:", notifyError);
        } else {
          console.log(`Created ${notifications.length} admin notifications`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        triggered_by: adminId ? 'admin' : 'scheduled',
        result: result
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Scheduled reconciliation error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
