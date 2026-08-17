import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CheckoutInput = { kind: "pick" | "plan"; id: string; sportScope?: string | null };

/** Stripe exige un mínimo de $10.00 MXN por cobro. */
const MIN_MXN_CENTS = 1000;

function originFrom(fallback?: string | null) {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const ref = fallback ?? getRequestHeader("referer");
  if (ref) {
    try {
      return new URL(ref).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:8080";
}

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CheckoutInput) => data)
  .handler(async ({ data, context }): Promise<{ url: string | null; message?: string }> => {
    const { supabase, userId, claims } = context;
    const { stripeRequest } = await import("./stripe.server");
    const origin = originFrom();

    if (data.kind === "pick") {
      const { data: pick, error } = await supabase
        .from("picks")
        .select("id, teams, price_cents, visibility")
        .eq("id", data.id)
        .maybeSingle();
      if (error || !pick) return { url: null, message: "No encontramos ese pick." };
      if (pick.visibility === "free") return { url: null, message: "Este pick ya es gratuito." };
      if (pick.price_cents < MIN_MXN_CENTS) {
        return {
          url: null,
          message:
            "El precio de esta predicción es menor al mínimo permitido por el procesador de pagos ($10.00 MXN). Actualízalo desde el panel de administración.",
        };
      }

      const session = await stripeRequest<{ url: string | null }>("/checkout/sessions", {
        method: "POST",
        form: {
          mode: "payment",
          "line_items[0][quantity]": 1,
          "line_items[0][price_data][currency]": "mxn",
          "line_items[0][price_data][unit_amount]": pick.price_cents,
          "line_items[0][price_data][product_data][name]": `Pick: ${pick.teams}`,
          customer_email: (claims as { email?: string }).email,
          "metadata[kind]": "pick",
          "metadata[user_id]": userId,
          "metadata[pick_id]": pick.id,
          success_url: `${origin}/pago?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/picks/${pick.id}`,
        },
      });
      return { url: session.url };
    }

    const { data: plan, error } = await supabase
      .from("plans")
      .select("id, name, price_cents, tier, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !plan || !plan.is_active)
      return { url: null, message: "Ese plan no está disponible." };
    if (plan.price_cents < MIN_MXN_CENTS) {
      return {
        url: null,
        message:
          "El precio de este plan es menor al mínimo permitido por el procesador de pagos ($10.00 MXN). Actualízalo desde el panel de administración.",
      };
    }

    const scope = plan.tier === 1 && data.sportScope ? data.sportScope : "";

    const session = await stripeRequest<{ url: string | null }>("/checkout/sessions", {
      method: "POST",
      form: {
        mode: "subscription",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": "mxn",
        "line_items[0][price_data][unit_amount]": plan.price_cents,
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": `Plan ${plan.name} — AliPicks`,
        customer_email: (claims as { email?: string }).email,
        "metadata[kind]": "plan",
        "metadata[user_id]": userId,
        "metadata[plan_id]": plan.id,
        "metadata[sport_scope]": scope,
        "subscription_data[metadata][kind]": "plan",
        "subscription_data[metadata][user_id]": userId,
        "subscription_data[metadata][plan_id]": plan.id,
        success_url: `${origin}/pago?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/planes`,
      },
    });
    return { url: session.url };
  });

type StripeSession = {
  id: string;
  payment_status: string;
  status: string;
  amount_total: number | null;
  subscription: string | null;
  metadata: Record<string, string>;
};

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean; kind?: string; message?: string }> => {
    const { userId } = context;
    const { stripeRequest } = await import("./stripe.server");
    const session = await stripeRequest<StripeSession>(
      `/checkout/sessions/${encodeURIComponent(data.sessionId)}`,
      { method: "GET" },
    );

    if (session.metadata?.["user_id"] !== userId) {
      return { ok: false, message: "Este pago no corresponde a tu cuenta." };
    }
    if (session.payment_status !== "paid") {
      return { ok: false, message: "El pago aún no se ha confirmado." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const kind = session.metadata["kind"];

    if (kind === "pick") {
      const pickId = session.metadata["pick_id"]!;
      const { data: existing } = await supabaseAdmin
        .from("pick_purchases")
        .select("id")
        .eq("provider_ref", session.id)
        .maybeSingle();
      if (!existing) {
        const { error } = await supabaseAdmin.from("pick_purchases").insert({
          user_id: userId,
          pick_id: pickId,
          amount_cents: session.amount_total ?? 0,
          status: "paid",
          provider_ref: session.id,
        });
        if (error) return { ok: false, message: "No pudimos registrar tu compra." };
      }
      return { ok: true, kind: "pick" };
    }

    const planId = session.metadata["plan_id"]!;
    const scope = session.metadata["sport_scope"] || null;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      plan_id: planId,
      status: "active",
      sport_scope: scope as "soccer" | "mlb" | null,
      cancel_at_period_end: false,
      current_period_end: periodEnd,
      provider_ref: session.subscription ?? session.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await supabaseAdmin.from("subscriptions").update(payload).eq("id", existing.id)
      : await supabaseAdmin.from("subscriptions").insert(payload);
    if (error) return { ok: false, message: "No pudimos activar tu plan." };

    return { ok: true, kind: "plan" };
  });
