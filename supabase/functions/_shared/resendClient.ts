// Shared Resend helper for FUN Profile.
// - Centralizes from address (RESEND_FROM_EMAIL/NAME), APP_URL.
// - Sends via Resend SDK and writes to email_delivery_logs (without leaking OTP/token/password).
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@fun.rich";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "FUN Ecosystem";
export const APP_URL = Deno.env.get("APP_URL") || "https://fun.rich";

export const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
export const FROM = `${FROM_NAME} <${FROM_EMAIL}>`;

function maskRecipient(email: string): { masked: string; domain: string } {
  const [local, domain] = (email || "").split("@");
  if (!domain) return { masked: "***", domain: "" };
  const head = local.slice(0, 2);
  const tail = local.length > 3 ? local.slice(-1) : "";
  return { masked: `${head}***${tail}@${domain}`, domain };
}

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
);

export interface LogEntry {
  email_type: string;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  resend_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  redirect_to?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logDelivery(entry: LogEntry): Promise<void> {
  try {
    const { masked, domain } = maskRecipient(entry.recipient);
    await adminClient.from("email_delivery_logs").insert({
      provider: "resend",
      email_type: entry.email_type,
      recipient_masked: masked,
      recipient_domain: domain,
      resend_message_id: entry.resend_message_id ?? null,
      status: entry.status,
      error_code: entry.error_code ?? null,
      error_message: entry.error_message ?? null,
      redirect_to: entry.redirect_to ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.error("[resendClient] logDelivery failed:", err);
  }
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  emailType: string;
  redirectTo?: string;
  metadata?: Record<string, unknown>;
}

export async function sendBrandedEmail(args: SendArgs): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  // Test-domain guard: KHÔNG gửi mail thật cho domain audit để tiết kiệm quota Resend
  const lowerTo = String(args.to || "").toLowerCase();
  if (lowerTo.endsWith("@fun.rich.test") || lowerTo.endsWith(".audit.fun.rich")) {
    await logDelivery({
      email_type: args.emailType,
      recipient: args.to,
      status: "skipped",
      error_code: "test_domain_skip",
      error_message: "Test/audit domain — không gửi Resend",
      redirect_to: args.redirectTo,
      metadata: { ...args.metadata, audit: true },
    });
    return { ok: true, messageId: "audit-skip" };
  }
  if (!resend) {
    console.error("[resendClient] RESEND_API_KEY not configured");
    await logDelivery({
      email_type: args.emailType,
      recipient: args.to,
      status: "failed",
      error_code: "missing_api_key",
      error_message: "RESEND_API_KEY not configured",
      redirect_to: args.redirectTo,
      metadata: args.metadata,
    });
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }


  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (error) {
      await logDelivery({
        email_type: args.emailType,
        recipient: args.to,
        status: "failed",
        error_code: (error as any).name || "resend_error",
        error_message: (error as any).message || String(error),
        redirect_to: args.redirectTo,
        metadata: args.metadata,
      });
      return { ok: false, error: (error as any).message || String(error) };
    }

    await logDelivery({
      email_type: args.emailType,
      recipient: args.to,
      status: "sent",
      resend_message_id: data?.id ?? null,
      redirect_to: args.redirectTo,
      metadata: args.metadata,
    });
    return { ok: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logDelivery({
      email_type: args.emailType,
      recipient: args.to,
      status: "failed",
      error_code: "exception",
      error_message: message,
      redirect_to: args.redirectTo,
      metadata: args.metadata,
    });
    return { ok: false, error: message };
  }
}
