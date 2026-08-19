import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ZEPTO_MAIL_API_KEY = Deno.env.get("ZEPTOMAIL_API_KEY") || "";
const ZEPTO_MAIL_ENDPOINT = Deno.env.get("ZEPTO_MAIL_ENDPOINT") || "https://api.zeptomail.com/v1.1/email";
const ZEPTO_MAIL_FROM = Deno.env.get("ZEPTO_MAIL_FROM") || "noreply@muwoyo.com";
const ZEPTO_MAIL_FROM_NAME = Deno.env.get("ZEPTO_MAIL_FROM_NAME") || "MUWOYO";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type TemplateType = "otp" | "welcome" | "trial_start" | "trial_expired" | "low_credits";
type Body = { to?: { email: string; name?: string } | string; template_type?: TemplateType; template_data?: Record<string, unknown> };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

function recipient(to: Body["to"]) {
  if (typeof to === "string") return { email: to, name: to };
  return { email: to?.email || "", name: to?.name || to?.email || "" };
}

function renderTemplate(type: TemplateType, data: Record<string, unknown>) {
  const name = escapeHtml(data.name || "Cliente");
  const remaining = escapeHtml(data.remaining ?? "0");
  const code = escapeHtml(data.code || "");
  const content: Record<TemplateType, { subject: string; title: string; body: string }> = {
    otp: { subject: "Confirme o seu e-mail na Muwoyo", title: "Confirme o seu e-mail", body: `<p>O seu código de confirmação é:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Este código expira em 10 minutos.</p>` },
    welcome: { subject: "Conta Muwoyo ativada", title: "Conta ativada", body: `<p>Olá, ${name}.</p><p>O seu e-mail foi confirmado e a sua conta Muwoyo está ativa. Os seus 50 créditos gratuitos foram liberados.</p>` },
    trial_start: { subject: "O seu teste Muwoyo começou", title: "Teste gratuito iniciado", body: `<p>Olá, ${name}.</p><p>O seu período de teste começou com 50 mensagens gratuitas. Saldo atual: <strong>${remaining}</strong>.</p>` },
    trial_expired: { subject: "O seu período de teste terminou", title: "Fim do teste gratuito", body: `<p>Olá, ${name}.</p><p>As suas mensagens de teste terminaram. Ative a sua conta para continuar a utilizar o Agente de IA.</p>` },
    low_credits: { subject: "O seu saldo Muwoyo está baixo", title: "Próximo do fim do crédito", body: `<p>Olá, ${name}.</p><p>Restam apenas <strong>${remaining}</strong> mensagens na sua conta Muwoyo.</p>` },
  };
  const selected = content[type];
  return { subject: selected.subject, htmlbody: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><div style="background:#25D366;padding:24px;color:white"><h2 style="margin:0">${selected.title}</h2></div><div style="padding:24px;line-height:1.6">${selected.body}<p style="color:#64748b;font-size:13px">Muwoyo · noreply@muwoyo.com</p></div></div>` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!SUPABASE_SERVICE_ROLE_KEY || authorization !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) return json({ success: false, error: "unauthorized" }, 401);
  if (!ZEPTO_MAIL_API_KEY) return json({ success: false, error: "not_configured" }, 503);

  try {
    const body = await req.json() as Body;
    const to = recipient(body.to);
    if (!to.email || !body.template_type) return json({ success: false, error: "invalid_payload" }, 400);
    const template = renderTemplate(body.template_type, body.template_data || {});
    const response = await fetch(ZEPTO_MAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Zoho-enczapikey ${ZEPTO_MAIL_API_KEY}` },
      body: JSON.stringify({ from: { address: ZEPTO_MAIL_FROM, name: ZEPTO_MAIL_FROM_NAME }, to: [{ email_address: { address: to.email, name: to.name } }], subject: template.subject, htmlbody: template.htmlbody }),
    });
    if (!response.ok) {
      console.error("ZeptoMail error", response.status, await response.text());
      return json({ success: false, error: "provider_error" }, 502);
    }
    return json({ success: true });
  } catch (error) {
    console.error("send-email error", error);
    return json({ success: false, error: "temporary_error" }, 500);
  }
});
