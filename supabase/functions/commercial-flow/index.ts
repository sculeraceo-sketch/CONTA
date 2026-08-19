import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function actor(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
  return role?.role && { admin, user: data.user, role: role.role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const current = await actor(req);
    if (!current || !["admin", "sub_admin"].includes(current.role)) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "listPendingActivations") {
      let query = current.admin.from("top_up_requests")
        .select("id,user_id,amount_kz,status,created_at,confirmed_at,payment_reference")
        .eq("request_type", "setup").in("status", ["pending", "confirmed"]).order("created_at", { ascending: true });
      const { data: requests, error } = await query;
      if (error) return json({ error: error.message }, 500);
      const ids = (requests || []).map((item) => item.user_id);
      let profilesQuery = current.admin.from("profiles").select("user_id,full_name,email,phone,created_at,account_status,setup_paid_at").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (current.role === "sub_admin") profilesQuery = profilesQuery.eq("created_by", current.user.id);
      const { data: profiles } = await profilesQuery;
      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
      return json({ requests: (requests || []).filter((item) => profileMap.has(item.user_id)).map((item) => ({ ...item, profile: profileMap.get(item.user_id) })) });
    }

    if (action === "confirmSetupPayment") {
      const requestId = String(body.requestId || "");
      if (!requestId) return json({ error: "invalid_input" }, 400);
      const { data, error } = await current.admin.rpc("confirm_setup_payment", {
        p_request_id: requestId,
        p_actor_id: current.user.id,
        p_payment_reference: typeof body.paymentReference === "string" ? body.paymentReference.slice(0, 120) : null,
      });
      if (error) return json({ error: error.message }, 400);
      for (const role of ["admin", "sub_admin"]) {
        const { data: managers } = await current.admin.from("user_roles").select("user_id").eq("role", role);
        for (const manager of managers || []) {
          await current.admin.from("notifications").insert({ user_id: manager.user_id, title: "Nova conta aguardando ativação", message: "Um setup foi confirmado e aguarda ativação.", type: "setup_awaiting_activation", link: "/admin" });
        }
      }
      return json(data);
    }

    if (action === "activateAccount") {
      const userId = String(body.userId || "");
      if (!userId) return json({ error: "invalid_input" }, 400);
      const { data, error } = await current.admin.rpc("activate_account", { p_user_id: userId, p_actor_id: current.user.id });
      if (error) return json({ error: error.message }, 403);
      return json(data);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("commercial-flow error", error);
    return json({ error: error instanceof Error ? error.message : "internal" }, 500);
  }
});