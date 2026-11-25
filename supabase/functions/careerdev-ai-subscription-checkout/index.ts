import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.117.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const readJsonKey = (name: string, fallback: string | undefined) => {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  try { return JSON.parse(raw).default ?? fallback; } catch { return fallback; }
};
const anonKey = readJsonKey("SUPABASE_PUBLISHABLE_KEYS", Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"));
const serviceKey = readJsonKey("SUPABASE_SECRET_KEYS", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
const appUrl = (Deno.env.get("CAREERDEV_APP_URL") ?? "https://careerdevglobal-nine.vercel.app").replace(/\/$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!anonKey) missing.push("SUPABASE_PUBLISHABLE_KEYS/ANON_KEY");
    if (!serviceKey) missing.push("SUPABASE_SERVER_CREDENTIAL");
    if (!paystackSecret) missing.push("PAYSTACK_SECRET_KEY");
    if (missing.length) return reply({ error: "Payment provider credentials are not configured", missing }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.email) return reply({ error: "Invalid authentication" }, 401);

    const { data: profile } = await userClient.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
    if (!profile || profile.status !== "active" || !["client", "coach"].includes(profile.role)) {
      return reply({ error: "Only active Clients and Coaches can subscribe to AI Agent plans" }, 403);
    }

    const body = await req.json();
    const planKey = String(body?.plan_key ?? "").trim();
    const interval = String(body?.billing_interval ?? "monthly").trim();
    const currency = String(body?.currency ?? "NGN").toUpperCase().trim();
    if (!planKey || !["monthly", "annual"].includes(interval)) {
      return reply({ error: "plan_key and a valid billing_interval are required" }, 400);
    }
    if (!["USD", "NGN"].includes(currency)) return reply({ error: "Unsupported checkout currency" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    if (currency === "USD") {
      const { data: currencySetting, error: settingError } = await admin
        .from("ai_subscription_currency_settings")
        .select("enabled")
        .eq("currency", "USD")
        .maybeSingle();
      if (settingError) return reply({ error: "USD checkout availability could not be confirmed. Please try NGN or contact support." }, 503);
      if (currencySetting?.enabled !== true) {
        return reply({
          error: "USD subscriptions are disabled until Paystack completes merchant currency enablement.",
          code: "USD_SUBSCRIPTIONS_DISABLED",
        }, 409);
      }
    }

    const { data: plan, error: planError } = await admin
      .from("ai_agent_subscription_plans")
      .select("*")
      .eq("plan_key", planKey)
      .eq("active", true)
      .maybeSingle();
    if (planError || !plan) return reply({ error: "Selected AI Agent plan was not found" }, 404);

    const { data: active } = await admin
      .from("ai_agent_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "non_renewing", "attention"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (active?.length) {
      return reply({ error: "You already have an active AI Agent subscription. Plan changes should be managed from the subscription management flow." }, 409);
    }

    const amount = Number(currency === "NGN"
      ? (interval === "monthly" ? plan.monthly_price_ngn : plan.annual_price_ngn)
      : (interval === "monthly" ? plan.monthly_price : plan.annual_price));
    const minorUnits = Math.round(amount * 100);
    const minimumMinorUnits = currency === "USD" ? 200 : 5000;
    if (!Number.isSafeInteger(minorUnits) || minorUnits < minimumMinorUnits) {
      return reply({ error: `The selected ${currency} amount is below Paystack's minimum supported subscription amount.` }, 400);
    }

    let planCode = currency === "NGN"
      ? (interval === "monthly" ? plan.paystack_monthly_plan_code_ngn : plan.paystack_annual_plan_code_ngn)
      : (interval === "monthly" ? plan.paystack_monthly_plan_code : plan.paystack_annual_plan_code);

    if (!planCode) {
      const response = await fetch("https://api.paystack.co/plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `CareerDev Global ${plan.name} ${interval === "monthly" ? "Monthly" : "Annual"} ${currency}`,
          amount: minorUnits,
          interval: interval === "monthly" ? "monthly" : "annually",
          description: plan.description,
          send_invoices: true,
          send_sms: false,
          currency,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.status !== true || !result?.data?.plan_code) {
        const providerMessage = String(result?.message ?? "Provider error").slice(0, 240);
        const looksLikeCurrencyAuthorization = /currency|merchant.*support|not enabled|not allowed/i.test(providerMessage);
        return reply({
          error: currency === "USD" && looksLikeCurrencyAuthorization
            ? "Paystack has not enabled USD for this merchant. Keep USD subscriptions disabled until Paystack approves the account and required documentation."
            : `Paystack could not create the ${currency} subscription plan.`,
          code: currency === "USD" && looksLikeCurrencyAuthorization ? "PAYSTACK_CURRENCY_NOT_ENABLED" : "PAYSTACK_PLAN_CREATE_FAILED",
          detail: providerMessage,
        }, 502);
      }

      planCode = String(result.data.plan_code);
      const planCodeUpdate = currency === "NGN"
        ? (interval === "monthly" ? { paystack_monthly_plan_code_ngn: planCode } : { paystack_annual_plan_code_ngn: planCode })
        : (interval === "monthly" ? { paystack_monthly_plan_code: planCode } : { paystack_annual_plan_code: planCode });
      const { error: savePlanCodeError } = await admin
        .from("ai_agent_subscription_plans")
        .update(planCodeUpdate)
        .eq("plan_key", planKey);
      if (savePlanCodeError) return reply({ error: "Paystack created the plan, but CareerDev Global could not safely link it. Please contact support before retrying." }, 503);
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("ai_agent_subscriptions")
      .insert({
        user_id: user.id,
        plan_key: planKey,
        billing_interval: interval,
        status: "pending",
        currency,
        amount,
        paystack_plan_code: planCode,
        metadata: { created_from: "pricing", plan_name: plan.name, currency },
      })
      .select("id")
      .single();
    if (subscriptionError || !subscription) return reply({ error: "Could not create subscription record" }, 500);

    const reference = `CDG-AI-${subscription.id.replaceAll("-", "").slice(0, 24)}`;
    const callbackUrl = `${appUrl}/pricing?payment=return&reference=${encodeURIComponent(reference)}`;
    const initialize = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: String(minorUnits),
        currency,
        reference,
        plan: planCode,
        callback_url: callbackUrl,
        metadata: { careerdev_ai_subscription_id: subscription.id, plan_key: planKey, billing_interval: interval, currency },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const checkout = await initialize.json().catch(() => ({}));
    if (!initialize.ok || checkout?.status !== true || !checkout?.data?.authorization_url) {
      const providerMessage = String(checkout?.message ?? "Provider error").slice(0, 240);
      await admin.from("ai_agent_subscriptions").update({ status: "cancelled", metadata: { checkout_error: providerMessage } }).eq("id", subscription.id);
      return reply({ error: `Paystack could not initialize ${currency} checkout.`, detail: providerMessage }, 502);
    }

    const { error: referenceError } = await admin.from("ai_agent_subscriptions").update({
      paystack_transaction_reference: reference,
      metadata: { careerdev_ai_subscription_id: subscription.id, plan_key: planKey, billing_interval: interval, currency },
    }).eq("id", subscription.id);
    if (referenceError) {
      await admin.from("ai_agent_subscriptions").update({ status: "cancelled" }).eq("id", subscription.id);
      return reply({ error: "Checkout was not released because its payment reference could not be stored safely. Please try again or contact support." }, 503);
    }

    return reply({
      status: "checkout_ready",
      subscription_id: subscription.id,
      plan_key: planKey,
      billing_interval: interval,
      amount,
      currency,
      authorization_url: checkout.data.authorization_url,
      reference,
    });
  } catch {
    return reply({ error: "Subscription checkout failed. Please retry or contact support." }, 500);
  }
});
