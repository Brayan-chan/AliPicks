import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCheckout } from "@/lib/payments.functions";
import { useMyAccount, usePicks, usePlans, useSession } from "@/hooks/use-alipicks";
import { PLAN_BENEFITS, money, type Plan } from "@/lib/alipicks";

export const Route = createFileRoute("/planes")({
  head: () => ({
    meta: [
      { title: "Planes y precios — AliPicks" },
      {
        name: "description",
        content:
          "Planes Starter, Pro y VIP: análisis por factores, marcadores proyectados y escenarios combinados de fútbol y MLB.",
      },
      { property: "og:title", content: "Planes y precios — AliPicks" },
      {
        property: "og:description",
        content: "Acceso ilimitado al análisis premium de fútbol y MLB con el plan Pro.",
      },
    ],
  }),
  component: PlansPage,
});

function PlansPage() {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: plans } = usePlans();
  const { data: picks } = usePicks();
  const navigate = useNavigate();
  const checkout = useServerFn(createCheckout);
  const [scope, setScope] = useState("soccer");
  const [loading, setLoading] = useState<string | null>(null);

  const spent = (account?.purchases ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const bought = account?.purchases.length ?? 0;
  const proPrice = (plans ?? []).find((p) => p.slug === "pro")?.price_cents ?? 1999;
  const savings = spent - proPrice;

  async function subscribe(plan: Plan) {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/planes" } });
      return;
    }
    setLoading(plan.id);
    try {
      const res = await checkout({
        data: { kind: "plan", id: plan.id, sportScope: plan.tier === 1 ? scope : null },
      });
      if (res.url) window.location.href = res.url;
      else toast.info(res.message ?? "No se pudo iniciar el pago.");
    } catch {
      toast.error("No se pudo iniciar el pago. Inténtalo de nuevo.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold md:text-4xl">Planes y precios</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Todos los planes incluyen acceso al historial completo. Cancela cuando quieras.
        </p>

        {bought > 0 && savings > 0 && (
          <div className="mt-6 rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-success">
            Has desbloqueado {bought} predicciones por {money(spent)}. Con el plan Pro habrías
            ahorrado {money(savings)}.
          </div>
        )}

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(plans ?? []).map((plan) => {
            const highlighted = plan.slug === "pro";
            const listed = Array.isArray(plan.features) ? (plan.features as string[]) : [];
            const features = listed.length ? listed : (PLAN_BENEFITS[plan.tier] ?? []);
            const current =
              account?.subscription?.plan_id === plan.id &&
              account.subscription.status === "active";
            return (
              <div
                key={plan.id}
                className={
                  highlighted
                    ? "surface-card relative rounded-2xl border border-primary/60 p-6 glow-brand"
                    : "surface-card rounded-2xl border border-border/70 p-6"
                }
              >
                {highlighted && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                    Más popular
                  </span>
                )}
                <p className="font-display text-xl font-bold">{plan.name}</p>
                <p className="mt-2 font-display text-4xl font-extrabold">
                  {money(plan.price_cents)}
                  <span className="text-sm font-medium text-muted-foreground">/mes</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

                {plan.tier === 1 && (
                  <div className="mt-4">
                    <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Elige tu deporte
                    </label>
                    <Select value={scope} onValueChange={setScope}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soccer">Fútbol</SelectItem>
                        <SelectItem value="mlb">MLB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <ul className="mt-5 space-y-2 text-sm">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2 text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className={
                    highlighted
                      ? "mt-6 w-full bg-gradient-brand text-primary-foreground"
                      : "mt-6 w-full"
                  }
                  variant={highlighted ? "default" : "secondary"}
                  disabled={loading !== null || current}
                  onClick={() => subscribe(plan)}
                >
                  {current ? (
                    "Tu plan actual"
                  ) : (
                    <>
                      <Sparkles className="size-4" /> Suscribirme
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-border/70 bg-card/50 p-6 text-sm text-muted-foreground">
          <p className="font-display text-base font-bold text-foreground">
            ¿Compra individual o suscripción?
          </p>
          <p className="mt-2">
            Cada predicción premium se puede desbloquear por separado. Hoy hay{" "}
            {
              (picks ?? []).filter((p) => p.visibility === "premium" && p.status === "pending")
                .length
            }{" "}
            predicciones premium activas: con el plan Pro tienes acceso a todas.
          </p>
        </div>

        <div className="mt-8">
          <ResponsibleNotice />
        </div>
      </div>
    </Layout>
  );
}
