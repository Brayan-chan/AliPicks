import { Link } from "@tanstack/react-router";
import { CalendarClock, Lock, Star, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventStateBadge, FollowHeart, Probabilities, RiskBadge, StatusBadge } from "./PickBits";
import { MetricInfo, METRIC_HELP } from "./MetricInfo";
import {
  PICK_TYPE_LABEL,
  SPORT_LABEL,
  formatDateTime,
  formatEventDate,
  maskText,
  money,
} from "@/lib/alipicks";
import {
  getLeagueName,
  getMatchTeams,
  getPrimaryPrediction,
  type StructuredPick,
} from "@/lib/sports-domain";

function TeamIdentity({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="grid size-12 place-items-center overflow-hidden rounded-full border border-border bg-background">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="size-9 object-contain" loading="lazy" />
        ) : (
          <span className="font-display text-sm font-bold text-muted-foreground">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-sm font-semibold leading-tight">{name}</span>
    </div>
  );
}

export function PickCard({
  pick,
  hasAccess,
  onUnlock,
  vip,
}: {
  pick: StructuredPick;
  hasAccess: boolean;
  onUnlock?: ((pick: StructuredPick) => void) | undefined;
  vip?: boolean | undefined;
}) {
  const locked = pick.visibility === "premium" && !hasAccess;
  const cancelled = pick.event_state === "cancelled";
  const primary = getPrimaryPrediction(pick);
  const match = getMatchTeams(pick);
  const leagueName = getLeagueName(pick);
  const homeName = match.home?.name ?? match.legacyHome;
  const awayName = match.away?.name ?? match.legacyAway;
  const hasPair = Boolean(homeName && awayName);

  return (
    <article className="surface-card animate-pop-in flex min-w-0 flex-col gap-4 rounded-2xl border p-5 transition-shadow duration-200 hover:shadow-[0_10px_34px_-20px_oklch(0.24_0.02_155_/_0.5)]">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {SPORT_LABEL[pick.sport]} · {leagueName}
          {primary.market_type ? ` · ${PICK_TYPE_LABEL[primary.market_type]}` : ""}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" /> {formatEventDate(pick.event_at)}
        </p>
      </div>

      {hasPair ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-4">
          <TeamIdentity name={homeName!} logoUrl={match.home?.logo_url ?? null} />
          <div className="shrink-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              vs
            </p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {pick.home_score ?? 0} - {pick.away_score ?? 0}
            </p>
            {pick.home_score == null && pick.away_score == null && (
              <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                previa
              </p>
            )}
          </div>
          <TeamIdentity name={awayName!} logoUrl={match.away?.logo_url ?? null} />
        </div>
      ) : (
        <h3 className="break-words font-display text-lg font-bold leading-snug tracking-tight">
          {match.label}
        </h3>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <EventStateBadge state={pick.event_state} />
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {pick.visibility === "premium" ? "Análisis completo" : "Acceso libre"}
        </span>
        {vip && pick.recommended && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            <Star className="size-3" /> Destacada
          </span>
        )}
        {primary.risk && <RiskBadge risk={primary.risk} />}
        {primary.result !== "pending" && <StatusBadge status={primary.result} />}
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-secondary/50 px-4 py-3">
        <p className="eyebrow">Primary Pick</p>
        <p className="mt-1 break-words font-display text-lg font-bold">
          {locked ? maskText(primary.selection ?? "Predicción") : primary.selection}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Confianza del modelo {primary.confidence}%
        </p>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          Probabilidad estimada
          <MetricInfo text={METRIC_HELP.probabilidad} label="probabilidad estimada" />
        </p>
        <Probabilities pick={pick} />
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {pick.short_description}
      </p>

      {pick.published_at && (
        <p className="text-[11px] text-muted-foreground/80">
          Publicada el {formatDateTime(pick.published_at)}
        </p>
      )}

      {locked ? (
        <Button className="min-h-11 w-full" onClick={() => onUnlock?.(pick)} disabled={cancelled}>
          <Lock className="size-4" /> Ver análisis completo · {money(pick.price_cents)}
        </Button>
      ) : (
        <Button asChild variant="secondary" className="min-h-11 w-full">
          <Link to="/picks/$id" params={{ id: pick.id }}>
            <Unlock className="size-4" /> Ver proyección completa
          </Link>
        </Button>
      )}
    </article>
  );
}
