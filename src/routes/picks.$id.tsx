import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileClock, Lock, Sparkles, Target } from "lucide-react";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { UnlockDialog } from "@/components/site/UnlockDialog";
import {
  EventStateBadge,
  FollowHeart,
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
  usePremium,
  useSession,
  useStructuredPick,
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
  SPORT_LABEL,
  TIER_LABEL,
  type PickStatus,
} from "@/lib/alipicks";
import {
  getLeagueName,
  getMatchTeams,
  getPrimaryPrediction,
  getScorePrediction,
  getSecondaryPrediction,
  type StructuredPick,
} from "@/lib/sports-domain";

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

function TeamBlock({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="grid size-16 place-items-center overflow-hidden rounded-full border border-border bg-background">
        {logo ? (
          <img src={logo} alt="" className="size-12 object-contain" />
        ) : (
          <span className="font-display text-lg font-bold text-muted-foreground">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <span className="font-display text-base font-bold sm:text-lg">{name}</span>
    </div>
  );
}

function PickDetail() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: pick, isLoading } = useStructuredPick(id);
  const access = pick ? hasPickAccess(pick, account) : false;
  const { data: premium } = usePremium(pick?.id, access && Boolean(user));
  const [unlock, setUnlock] = useState(false);
  useLogView(user?.id, pick?.id);

  if (isLoading)
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </Layout>
    );
  if (!pick)
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

  const factors = parseFactors(pick.factors);
  const tabs = parseTabs(pick.extra_tabs);
  const shownTabs = visibleTabs(tabs, planTier(account), access);
  const primary = getPrimaryPrediction(pick);
  const secondary = getSecondaryPrediction(pick);
  const primaryScore = getScorePrediction(pick, "primary_score");
  const altScore = getScorePrediction(pick, "alt_score");
  const match = getMatchTeams(pick);
  const homeName = match.home?.name ?? match.legacyHome;
  const awayName = match.away?.name ?? match.legacyAway;
  const actualScore =
    pick.home_score != null && pick.away_score != null
      ? `${pick.home_score} - ${pick.away_score}`
      : null;

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {SPORT_LABEL[pick.sport]} · {getLeagueName(pick)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatEventDate(pick.event_at)}</p>
            </div>
            <FollowHeart pick={pick} hasAccess={access} onUnlock={() => setUnlock(true)} />
          </div>

          {homeName && awayName ? (
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-border bg-secondary/30 px-4 py-6">
              <TeamBlock name={homeName} logo={match.home?.logo_url ?? null} />
              <div className="shrink-0 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {actualScore ? "Marcador" : "vs"}
                </p>
                <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">
                  {actualScore ?? "0 - 0"}
                </p>
                {!actualScore && (
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Previa
                  </p>
                )}
              </div>
              <TeamBlock name={awayName} logo={match.away?.logo_url ?? null} />
            </div>
          ) : (
            <h1 className="mt-4 break-words font-display text-2xl font-extrabold sm:text-3xl">
              {match.label}
            </h1>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EventStateBadge state={pick.event_state} />
            {primary.risk && <RiskBadge risk={primary.risk} />}
            {primary.result !== "pending" && <StatusBadge status={primary.result} />}
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
            <span>Resultado del partido: {actualScore ?? pick.final_result ?? "Pendiente"}</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <SelectionCard
              label="Primary Pick"
              type={primary.market_type ? PICK_TYPE_LABEL[primary.market_type] : "Mercado"}
              selection={primary.selection ?? "Predicción"}
              odds={primary.odds}
              confidence={primary.confidence}
              risk={primary.risk ? RISK_LABEL[primary.risk] : null}
              result={primary.result}
              locked={!access}
            />
            {secondary && (
              <SelectionCard
                label="Secondary Pick"
                type={secondary.market_type ? PICK_TYPE_LABEL[secondary.market_type] : "Mercado"}
                selection={secondary.selection ?? "Predicción"}
                odds={secondary.odds}
                confidence={secondary.confidence}
                risk={secondary.risk ? RISK_LABEL[secondary.risk] : null}
                result={secondary.result}
                locked={!access}
              />
            )}
          </div>

          {(primaryScore || altScore) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {primaryScore && (
                <ScoreCard
                  label="Primary Score"
                  home={primaryScore.predicted_home_score}
                  away={primaryScore.predicted_away_score}
                  confidence={primaryScore.confidence}
                  result={primaryScore.result}
                  locked={!access}
                />
              )}
              {altScore && (
                <ScoreCard
                  label="Alt Score"
                  home={altScore.predicted_home_score}
                  away={altScore.predicted_away_score}
                  confidence={altScore.confidence}
                  result={altScore.result}
                  locked={!access}
                />
              )}
            </div>
          )}
          {(primaryScore || altScore) && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Los marcadores exactos son proyecciones probabilísticas del modelo y se muestran como
              referencia analítica; no incluyen cuota ni clasificación de riesgo.
            </p>
          )}

          <div className="mt-6 rounded-xl border border-border bg-secondary/40 p-4">
            <p className="eyebrow mb-2 flex items-center gap-1.5">
              Probabilidad estimada{" "}
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
                        <p className="font-display text-sm font-bold">{f.title}</p>
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
                      <span className="font-semibold text-foreground">
                        Escenarios alternativos:{" "}
                      </span>
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
            <Link to="/metodologia" className="text-xs font-semibold text-gold hover:underline">
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
  result,
  locked,
}: {
  label: string;
  type: string;
  selection: string;
  odds: number | null;
  confidence: number;
  risk: string | null;
  result: PickStatus;
  locked: boolean;
}) {
  const prob = impliedProbability(odds);
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-secondary/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{type}</p>
        </div>
        {result !== "pending" && <StatusBadge status={result} />}
      </div>
      <p className="mt-1 break-words font-display text-xl font-bold">
        {locked ? "•••••" : selection}
      </p>
      {odds != null && !locked && (
        <p className="mt-1 text-xs text-muted-foreground">
          Cuota {odds.toFixed(2)}
          {prob != null ? ` · implícita ${prob}%` : ""}
        </p>
      )}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            Confianza del modelo{" "}
            <MetricInfo text={METRIC_HELP.confianza} label="confianza del modelo" />
          </span>
          <span className="font-semibold text-foreground">{confidenceOutOfTen(confidence)}/10</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-brand"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
      {risk && <p className="mt-2 text-[11px] text-muted-foreground">{risk}</p>}
    </div>
  );
}

function ScoreCard({
  label,
  home,
  away,
  confidence,
  result,
  locked,
}: {
  label: string;
  home: number | null;
  away: number | null;
  confidence: number;
  result: PickStatus;
  locked: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card/60 p-4 text-center">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {result !== "pending" && <StatusBadge status={result} />}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold text-gradient-brand">
        {locked ? "? - ?" : `${home ?? "?"} - ${away ?? "?"}`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Confianza del modelo {confidence}%</p>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Proyección analítica · sin cuota · sin riesgo
      </p>
    </div>
  );
}

function LockedBlock({ pick, onUnlock }: { pick: StructuredPick; onUnlock: () => void }) {
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
