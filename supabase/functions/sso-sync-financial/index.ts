/**
 * SSO Sync Financial - Financial Data Contract Implementation
 * 
 * Endpoint for platforms to sync individual financial transactions.
 * Implements idempotency via transaction_id.
 * 
 * @see docs/FINANCIAL_DATA_CONTRACT.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAccessToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Valid actions per Data Contract
const VALID_ACTIONS = [
  'CLAIM_REWARD',
  'SEND_MONEY', 
  'RECEIVE_MONEY',
  'DEPOSIT',
  'WITHDRAW',
  'BET',
  'WIN',
  'LOSS',
  'ADJUSTMENT_ADD',
  'ADJUSTMENT_SUB',
] as const;

type FinancialAction = typeof VALID_ACTIONS[number];

interface FinancialSyncPayload {
  fun_id?: string;
  platform_key?: string;
  action: FinancialAction;
  amount: number;
  currency?: string;
  transaction_id: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface FinancialData {
  total_deposit: number;
  total_withdraw: number;
  total_bet: number;
  total_win: number;
  total_loss: number;
  total_profit: number;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", error_description: "Only POST method is allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Verify Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", error_description: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = authHeader.substring(7);
    
    // Verify JWT
    const jwtPayload = await verifyAccessToken(accessToken);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string;
    let clientId: string;
    let grantedScopes: string[] = [];

    if (jwtPayload) {
      // JWT verified successfully
      userId = jwtPayload.sub;
      grantedScopes = jwtPayload.scope || [];
      
      // Get client_id from token lookup
      const { data: tokenData } = await supabase
        .from("cross_platform_tokens")
        .select("client_id")
        .eq("user_id", userId)
        .eq("is_revoked", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      clientId = tokenData?.client_id || "unknown";
    } else {
      // Fallback: lookup opaque token in database
      const { data: tokenData, error: tokenError } = await supabase
        .from("cross_platform_tokens")
        .select("user_id, client_id, scope, access_token_expires_at")
        .eq("access_token", accessToken)
        .eq("is_revoked", false)
        .single();

      if (tokenError || !tokenData) {
        return new Response(
          JSON.stringify({ error: "invalid_token", error_description: "Token not found or revoked" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check expiry
      if (new Date(tokenData.access_token_expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "token_expired", error_description: "Access token has expired" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = tokenData.user_id;
      clientId = tokenData.client_id;
      grantedScopes = tokenData.scope || [];
    }

    // 2. Enforce finance.write scope (OAuth 2.0 insufficient_scope)
    if (!grantedScopes.includes("finance.write")) {
      console.warn(`[sso-sync-financial] User ${userId} missing finance.write scope, has: ${grantedScopes.join(", ")}`);
      return new Response(
        JSON.stringify({
          error: "insufficient_scope",
          error_description: "Token requires the 'finance.write' scope to sync financial data",
          required_scope: "finance.write",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and validate payload
    let payload: FinancialSyncPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!payload.action || !VALID_ACTIONS.includes(payload.action)) {
      return new Response(
        JSON.stringify({ 
          error: "validation_error", 
          error_description: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof payload.amount !== "number" || payload.amount < 0) {
      return new Response(
        JSON.stringify({ error: "validation_error", error_description: "Amount must be a non-negative number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.transaction_id || typeof payload.transaction_id !== "string") {
      return new Response(
        JSON.stringify({ error: "validation_error", error_description: "transaction_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use platform_key from payload or clientId from token
    const effectiveClientId = payload.platform_key || clientId;
    const currency = payload.currency || "CAMLY";

    // 4. Idempotency check - check if transaction already exists
    const { data: existingTx } = await supabase
      .from("financial_transactions")
      .select("id, created_at")
      .eq("client_id", effectiveClientId)
      .eq("transaction_id", payload.transaction_id)
      .single();

    if (existingTx) {
      // Transaction already processed - return success per Cha's guidance
      // (Idempotency: return 200 OK but don't insert again)
      console.log(`[sso-sync-financial] Duplicate transaction_id: ${payload.transaction_id} for client ${effectiveClientId}`);
      
      // Get current balance
      const { data: currentBalance } = await supabase
        .from("platform_financial_data")
        .select("total_deposit, total_withdraw, total_bet, total_win, total_loss, total_profit")
        .eq("user_id", userId)
        .eq("client_id", effectiveClientId)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          already_processed: true,
          transaction_id: payload.transaction_id,
          action: payload.action,
          amount: payload.amount,
          processed_at: existingTx.created_at,
          new_balance: currentBalance || null,
          message: "Transaction already processed (idempotent)",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Insert new transaction (trigger will auto-update aggregates)
    const { data: newTx, error: insertError } = await supabase
      .from("financial_transactions")
      .insert({
        user_id: userId,
        client_id: effectiveClientId,
        action: payload.action,
        amount: Math.round(payload.amount), // Ensure integer
        currency,
        transaction_id: payload.transaction_id,
        metadata: payload.metadata || {},
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      // Check for unique constraint violation (race condition)
      if (insertError.code === "23505") {
        // Duplicate - return success (idempotent)
        const { data: currentBalance } = await supabase
          .from("platform_financial_data")
          .select("total_deposit, total_withdraw, total_bet, total_win, total_loss, total_profit")
          .eq("user_id", userId)
          .eq("client_id", effectiveClientId)
          .single();

        return new Response(
          JSON.stringify({
            success: true,
            already_processed: true,
            transaction_id: payload.transaction_id,
            action: payload.action,
            amount: payload.amount,
            new_balance: currentBalance || null,
            message: "Transaction already processed (race condition handled)",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("[sso-sync-financial] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "database_error", error_description: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Get updated balance (trigger has already updated platform_financial_data)
    const { data: updatedBalance } = await supabase
      .from("platform_financial_data")
      .select("total_deposit, total_withdraw, total_bet, total_win, total_loss, total_profit")
      .eq("user_id", userId)
      .eq("client_id", effectiveClientId)
      .single();

    // 7. Update last_used_at for the token
    await supabase
      .from("cross_platform_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_id", effectiveClientId)
      .eq("is_revoked", false);

    // 8. Return success response
    console.log(`[sso-sync-financial] Transaction ${payload.transaction_id} processed: ${payload.action} ${payload.amount} ${currency}`);

    return new Response(
      JSON.stringify({
        success: true,
        already_processed: false,
        transaction_id: payload.transaction_id,
        action: payload.action,
        amount: payload.amount,
        currency,
        internal_id: newTx.id,
        synced_at: newTx.created_at,
        new_balance: updatedBalance || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[sso-sync-financial] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "server_error", 
        error_description: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
