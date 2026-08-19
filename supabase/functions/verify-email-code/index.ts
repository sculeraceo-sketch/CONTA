import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user?.email) return json({ success: false, error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return json({ success: false, error: "invalid_code" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: verification, error: lookupError } = await admin
      .from("email_verifications")
      .select("id,code_hash,expires_at,attempts,max_attempts")
      .eq("user_id", user.id)
      .eq("email", user.email)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) return json({ success: false, error: "temporary_error" }, 500);
    if (!verification) return json({ success: false, error: "expired_code" }, 400);
    if (verification.attempts >= verification.max_attempts) return json({ success: false, error: "too_many_attempts" }, 429);
    if (new Date(verification.expires_at).getTime() <= Date.now()) return json({ success: false, error: "expired_code" }, 400);

    const codeHash = await sha256(code);
    if (codeHash !== verification.code_hash) {
      const nextAttempts = verification.attempts + 1;
      await admin.from("email_verifications").update({ attempts: nextAttempts }).eq("id", verification.id);
      return json({ success: false, error: nextAttempts >= verification.max_attempts ? "too_many_attempts" : "invalid_code" }, nextAttempts >= verification.max_attempts ? 429 : 400);
    }

    const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confirmError) {
      console.error("Could not confirm Supabase email", confirmError);
      return json({ success: false, error: "temporary_error" }, 500);
    }

    const { error: consumeError } = await admin
      .from("email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", verification.id)
      .is("consumed_at", null);
    if (consumeError) return json({ success: false, error: "temporary_error" }, 500);

    const { error: verifiedError } = await admin.rpc("mark_email_verified", { p_user_id: user.id });
    if (verifiedError) {
      console.error("Could not mark profile email as verified", verifiedError);
      return json({ success: false, error: "temporary_error" }, 500);
    }

    const { error: creditError } = await admin.rpc("release_trial_credits_after_email_verification", { p_user_id: user.id });
    if (creditError) {
      console.error("Could not release trial credits", creditError);
      return json({ success: false, error: "temporary_error" }, 500);
    }

    const profile = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    const welcomeResponse = await fetch(SEND_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        to: { email: user.email, name: profile.data?.full_name || user.email },
        template_type: "welcome",
        template_data: { name: profile.data?.full_name || user.email },
      }),
    });
    if (!welcomeResponse.ok) console.error("Welcome email failed", welcomeResponse.status);

    return json({ success: true });
  } catch (error) {
    console.error("verify-email-code error", error);
    return json({ success: false, error: "temporary_error" }, 500);
  }
});
