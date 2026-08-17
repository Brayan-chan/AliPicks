import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileClock, Lock, Sparkles, Target } from "lucide-react";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { UnlockDialog } from "@/components/site/UnlockDialog";
import {
  EventStateBadge,
  FollowHeart,
  MetaLine,
  Probabilities,
  RiskBadge,
  StatusBadge,
} from "@/components/site/PickBits";
import { Button } from "@/components/ui/button";
import { MetricInfo, METRIC_HELP } from "@/components/site/MetricInfo";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  hasPickAccess,
  planTier,
  useLogView,
  useMyAccount,
  usePick,
  usePremium,
  useSession,
  visibleTabs,
} from "@/hooks/use-alipicks";
import {
  confidenceOutOfTen,
  formatDateTime,
  formatEventDate,
  impliedProbability,
  money,
  parseFactors,
  parseTabs,
  PICK_TYPE_LABEL,
  RISK_LABEL,
  TIER_LABEL,
  type Pick,
} from "@/lib/alipicks";

export const Route = createFileRoute("/picks/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de la predicción — AliPicks" },
      {
        name: "description",
        content:
          "Proyección principal y secundaria, marcadores proyectados, confianza del modelo y análisis de seis factores del partido.",
      },
      { property: "og:title", content: "Detalle de la predicción — AliPicks" },
      {
        property: "og:description",
        content: "Análisis deportivo completo del partido: factores, proyecciones y datos.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PickDetail,
});

function PickDetail() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: pick, isLoading } = usePick(id);
  const access = pick ? hasPickAccess(pick, account) : false;
  const { data: premium } = usePremium(pick?.id, access && Boolean(user));
  const [unlock, setUnlock] = useState(false);
  useLogView(user?.id, pick?.id);

  if (isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!pick) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Predicción no encontrada</h1>
          <Button asChild className="mt-4">
            <Link to="/picks">Volver a las predicciones</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const factors = parseFactors(pick.factors);
  const tabs = parseTabs(pick.extra_tabs);
  const tier = planTier(account);
  const shownTabs = visibleTabs(tabs, tier, access);

  return (
    <Layout>
      <UnlockDialog pick={pick} open={unlock} onOpenChange={setUnlock} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/picks">
            <ArrowLeft className="size-4" /> Todas las predicciones
          </Link>
        </Button>

        <div className="surface-card overflow-hidden rounded-2xl border p-5 sm:p-8">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <MetaLine pick={pick} />
              <h1 className="mt-1 break-words font-display text-2xl font-extrabold sm:text-3xl">
                {pick.teams}
              </h1>
            </div>
            <FollowHeart pick={pick} hasAccess={access} onUnlock={() => setUnlock(true)} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EventStateBadge state={pick.event_state} />
            <span>{formatEventDate(pick.event_at)}</span>
            <RiskBadge risk={pick.risk} />
            <StatusBadge status={pick.status} />
            <span className="rounded-full border border-border px-2 py-0.5 font-semibold text-muted-foreground">
              {pick.visibility === "premium" ? "Análisis completo" : "Acceso libre"}
            </span>
            {pick.tags.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {pick.short_description}
          </p>

          <div className="mt-5 grid gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-3">
            <span className="flex items-center gap-1.5">
              <FileClock className="size-3.5 shrink-0" />
              {pick.published_at
                ? `Publicada el ${formatDateTime(pick.published_at)}`
                : `Registrada el ${formatDateTime(pick.created_at)}`}
            </span>
            <span>Última actualización: {formatDateTime(pick.updated_at)}</span>
            <span>
              Resultado final: {pick.final_result ? pick.final_result : "Pendiente de cierre"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <SelectionCard
              label="Proyección principal"
              type={PICK_TYPE_LABEL[pick.pick_type]}
              selection={pick.selection}
              odds={pick.odds}
              confidence={pick.confidence}
              risk={RISK_LABEL[pick.risk]}
              locked={!access}
            />
            {pick.secondary_selection && (
              <SelectionCard
                label="Proyección secundaria"
                type={PICK_TYPE_LABEL[pick.secondary_pick_type ?? pick.pick_type]}
                selection={pick.secondary_selection}
                odds={pick.secondary_odds}
                confidence={pick.secondary_confidence ?? 0}
                risk={RISK_LABEL[pick.secondary_risk ?? pick.risk]}
                locked={!access}
              />
            )}
          </div>

          {(pick.score_primary || pick.score_secondary) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {pick.score_primary && (
                <ScoreCard
                  label="Marcador proyectado"
                  score={pick.score_primary}
                  confidence={pick.score_primary_confidence}
                  locked={!access}
                />
              )}
              {pick.score_secondary && (
                <ScoreCard
                  label="Marcador alternativo"
                  score={pick.score_secondary}
                  confidence={pick.score_secondary_confidence}
                  locked={!access}
                />
              )}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-border bg-secondary/40 p-4">
            <p className="eyebrow mb-2 flex items-center gap-1.5">
              Probabilidad estimada
              <MetricInfo text={METRIC_HELP.probabilidad} label="probabilidad estimada" />
            </p>
            <Probabilities pick={pick} />
          </div>

          {access ? (
            <div className="mt-6 space-y-6">
              {pick.basic_analysis && (
                <section>
                  <h2 className="font-display text-lg font-bold">Resumen del partido</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pick.basic_analysis}
                  </p>
                </section>
              )}

              {factors.length > 0 && (
                <section>
                  <h2 className="font-display text-lg font-bold">Factores analizados</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {factors.map((f) => (
                      <div
                        key={f.title}
                        className="min-w-0 rounded-xl border border-border bg-card p-5"
                        style={{ borderLeft: `3px solid ${f.color}` }}
                      >
                        <p className="font-display text-sm font-bold">
                          {f.title}
                        </p>
                        <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
                          {f.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {shownTabs.length > 0 && (
                <section>
                  <h2 className="font-display text-lg font-bold">Datos del partido</h2>
                  <Tabs defaultValue={shownTabs[0]!.label} className="mt-3">
                    <TabsList className="flex w-full flex-wrap justify-start gap-1">
                      {shownTabs.map((t) => (
                        <TabsTrigger key={t.label} value={t.label}>
                          {t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {shownTabs.map((t) => (
                      <TabsContent key={t.label} value={t.label} className="mt-3">
                        {t.text && (
                          <p className="text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                        )}
                        {t.rows && t.rows.length > 0 && (
                          <div className="overflow-x-auto rounded-xl border border-border/60">
                            <table className="w-full min-w-[420px] text-sm">
                              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  {Object.keys(t.rows[0]!).map((k) => (
                                    <th key={k} className="px-3 py-2 font-semibold">
                                      {k}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {t.rows.map((row, i) => (
                                  <tr key={i} className="border-t border-border/50">
                                    {Object.values(row).map((v, j) => (
                                      <td key={j} className="px-3 py-2 text-muted-foreground">
                                        {String(v)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                  {shownTabs.length < tabs.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Hay {tabs.length - shownTabs.length} pestañas adicionales disponibles con el
                      plan Pro.
                    </p>
                  )}
                </section>
              )}

              {pick.visibility === "premium" && premium && (
                <section className="rounded-xl border border-border bg-accent/60 p-5">
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                    <Sparkles className="size-4 text-gold" /> Análisis ampliado
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {premium.advanced_analysis}
                  </p>
                  {premium.key_factors.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {premium.key_factors.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span className="text-gold">•</span> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {premium.alternatives && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">Escenarios alternativos: </span>
                      {premium.alternatives}
                    </p>
                  )}
                </section>
              )}
            </div>
          ) : (
            <LockedBlock pick={pick} onUnlock={() => setUnlock(true)} />
          )}

          <div className="mt-8 border-t border-border pt-5">
            <Link
              to="/metodologia"
              className="text-xs font-semibold text-gold hover:underline"
            >
              Cómo generamos esta proyección →
            </Link>
          </div>
          <div className="mt-4">
            <ResponsibleNotice />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SelectionCard({
  label,
  type,
  selection,
  odds,
  confidence,
  risk,
  locked,
}: {
  label: string;
  type: string;
  selection: string;
  odds: number | null;
  confidence: number;
  risk: string;
  locked: boolean;
}) {
  const prob = impliedProbability(odds);
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-secondary/30 p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{type}</p>
      <p className="mt-1 break-words font-display text-xl font-bold">
        {locked ? "•••••" : selection}
      </p>
      {prob != null && !locked && (
        <p className="mt-1 text-xs text-muted-foreground">Probabilidad estimada: {prob}%</p>
      )}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            Confianza del modelo
            <MetricInfo text={METRIC_HELP.confianza} label="confianza del modelo" />
          </span>
          <span className="font-semibold text-foreground">{confidenceOutOfTen(confidence)}/10</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${confidence}%` }} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{risk}</p>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  confidence,
  locked,
}: {
  label: string;
  score: string;
  confidence: number | null;
  locked: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card/60 p-4 text-center">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold text-gradient-brand">
        {locked ? "?-?" : score}
      </p>
      {confidence != null && (
        <p className="mt-1 text-xs text-muted-foreground">Confianza {confidence}%</p>
      )}
    </div>
  );
}

function LockedBlock({ pick, onUnlock }: { pick: Pick; onUnlock: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-6 text-center">
      <Lock className="mx-auto size-6 text-gold" />
      <h2 className="mt-2 font-display text-xl font-bold">Análisis completo</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        Los factores analizados, los marcadores proyectados y las pestañas de datos de esta
        predicción están disponibles con el plan {TIER_LABEL[pick.min_plan_tier]}.
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Button className="min-h-11" onClick={onUnlock}>
          <Target className="size-4" /> Acceder por {money(pick.price_cents)}
        </Button>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/planes">Ver planes</Link>
        </Button>
      </div>
    </div>
  );
}
