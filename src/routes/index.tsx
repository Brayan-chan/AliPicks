import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { PickCard } from "@/components/site/PickCard";
import { UnlockDialog } from "@/components/site/UnlockDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccuracyChart } from "@/components/site/AccuracyChart";
import { MetricInfo, METRIC_HELP } from "@/components/site/MetricInfo";
import { hasPickAccess, planTier, useMyAccount, usePicks, usePlans, useSession } from "@/hooks/use-alipicks";
import { accuracy, money, weeklySeries, type Pick } from "@/lib/alipicks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AliPicks — Análisis y proyecciones de fútbol y MLB" },
      {
        name: "description",
        content:
          "Predicciones deportivas basadas en datos, con proyecciones diarias de acceso libre, historial verificable y metodología pública. Contenido analítico +18.",
      },
      { property: "og:title", content: "AliPicks — Análisis y proyecciones de fútbol y MLB" },
      {
        property: "og:description",
        content: "Proyecciones diarias basadas en datos, con historial verificable y metodología pública.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const tier = planTier(account);
  const { data: picks, isLoading } = usePicks();
  const { data: plans } = usePlans();
  const [unlock, setUnlock] = useState<Pick | null>(null);

  const { free, premium, stats, weekly } = useMemo(() => {
    const all = picks ?? [];
    const pending = all.filter((p) => p.status === "pending");
    return {
      free: pending.filter((p) => p.visibility === "free").slice(0, 3),
      premium: pending.filter((p) => p.visibility === "premium").slice(0, 6),
      stats: accuracy(all),
      weekly: weeklySeries(all),
    };
  }, [picks]);

  return (
    <Layout>
      <UnlockDialog pick={unlock} open={unlock !== null} onOpenChange={(v) => !v && setUnlock(null)} />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-gold" /> Historial verificable
          </span>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Análisis deportivo basado en datos, no en corazonadas.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Publicamos proyecciones de fútbol y MLB con su metodología, su fecha de publicación y su
            resultado final. Cada predicción queda registrada para que puedas comprobarla.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/picks">
                Ver predicciones del día <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/metodologia">Cómo funciona</Link>
            </Button>
          </div>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            <Stat
              label="Rendimiento histórico"
              value={stats.total ? `${stats.rate}%` : "—"}
              help={METRIC_HELP.rendimiento}
            />
            <Stat label="Predicciones acertadas" value={stats.total ? `${stats.won}` : "—"} />
            <Stat label="Eventos finalizados" value={`${stats.total}`} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 lg:px-8">
        <SectionTitle
          title="Predicciones de acceso libre"
          subtitle="Proyecciones publicadas para todos los usuarios, con su análisis básico."
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)
          ) : free.length ? (
            free.map((p) => <PickCard key={p.id} pick={p} hasAccess />)
          ) : (
            <EmptyState text="No hay predicciones de acceso libre publicadas en este momento." />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 lg:px-8">
        <SectionTitle
          icon={<Sparkles className="size-4 text-gold" />}
          title="Análisis completo"
          subtitle="Factores analizados, marcadores proyectados y pestañas de datos para suscriptores."
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {premium.length ? (
            premium.map((p) => (
              <PickCard
                key={p.id}
                pick={p}
                hasAccess={hasPickAccess(p, account)}
                onUnlock={setUnlock}
                vip={tier >= 3}
              />
            ))
          ) : (
            <EmptyState text="Aún no hay predicciones con análisis completo disponibles." />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 lg:px-8">
        <div className="surface-card rounded-2xl border p-6 sm:p-8">
          <SectionTitle
            icon={<BarChart3 className="size-4 text-gold" />}
            title="Rendimiento de la semana"
            subtitle="Resultado de las predicciones ya finalizadas en los últimos 7 días."
          />
          <div className="mt-6 min-w-0">
            {stats.total ? (
              <AccuracyChart data={weekly} />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <LineChart className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Aún no hay eventos finalizados suficientes para mostrar el rendimiento.
                </p>
              </div>
            )}
          </div>
          <Button asChild variant="link" className="mt-4 px-0">
            <Link to="/historial">
              Ver historial completo <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 lg:px-8">
        <SectionTitle title="Planes" subtitle="Elige el nivel de análisis que necesitas." />
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {(plans ?? []).map((plan) => (
            <div key={plan.id} className="surface-card rounded-2xl border p-6">
              <p className="font-display text-base font-bold">{plan.name}</p>
              <p className="mt-2 font-display text-3xl font-extrabold">
                {money(plan.price_cents)}
                <span className="text-sm font-medium text-muted-foreground">/mes</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <ResponsibleNotice />
          </div>
          <Button asChild>
            <Link to="/planes">Comparar planes</Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="surface-card rounded-xl border px-4 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{label}</span>
        {help && <MetricInfo text={help} label={label} />}
      </p>
      <p className="mt-2 font-display text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        {icon} {title}
      </h2>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
