import { Link } from "@tanstack/react-router";
import { CalendarClock, Lock, Star, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EventStateBadge,
  FollowHeart,
  MetaLine,
  Probabilities,
  RiskBadge,
  StatusBadge,
} from "./PickBits";
import { MetricInfo, METRIC_HELP } from "./MetricInfo";
import { formatDateTime, formatEventDate, maskText, money, type Pick } from "@/lib/alipicks";

export function PickCard({
  pick,
  hasAccess,
  onUnlock,
  vip,
}: {
  pick: Pick;
  hasAccess: boolean;
  onUnlock?: ((pick: Pick) => void) | undefined;
  vip?: boolean | undefined;
}) {
  const locked = pick.visibility === "premium" && !hasAccess;
  const cancelled = pick.event_state === "cancelled";

  return (
    <article className="surface-card animate-pop-in flex min-w-0 flex-col gap-4 rounded-2xl border p-5 transition-shadow duration-200 hover:shadow-[0_10px_34px_-20px_oklch(0.24_0.02_155_/_0.5)]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <MetaLine pick={pick} />
          <h3 className="mt-1.5 break-words font-display text-lg font-bold leading-snug tracking-tight">
            {pick.teams}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0" /> {formatEventDate(pick.event_at)}
          </p>
        </div>
        <FollowHeart pick={pick} hasAccess={!locked} onUnlock={onUnlock} />
      </div>

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
        <RiskBadge risk={pick.risk} />
        {pick.status !== "pending" && <StatusBadge status={pick.status} />}
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-secondary/50 px-4 py-3">
        <p className="eyebrow">Proyección principal</p>
        <p className="mt-1 break-words font-display text-lg font-bold">
          {locked ? maskText(pick.selection) : pick.selection}
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
