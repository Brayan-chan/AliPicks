import { useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EVENT_STATE_LABEL,
  PICK_TYPE_LABEL,
  RISK_LABEL,
  SPORT_LABEL,
  STATUS_LABEL,
  type EventState,
  type Pick,
} from "@/lib/alipicks";
import { useFollows, useSession, useToggleFollow } from "@/hooks/use-alipicks";

export function RiskBadge({ risk }: { risk: Pick["risk"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        risk === "bajo" && "bg-success/15 text-success",
        risk === "medio" && "bg-warning/15 text-warning",
        risk === "alto" && "bg-danger/15 text-danger",
      )}
    >
      {RISK_LABEL[risk]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Pick["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        status === "won" && "bg-success/15 text-success",
        status === "lost" && "bg-danger/15 text-danger",
        status === "pending" && "bg-secondary text-muted-foreground",
        status === "void" && "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EventStateBadge({ state }: { state: string }) {
  const s = (state as EventState) ?? "upcoming";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        s === "upcoming" && "bg-info/15 text-info",
        s === "live" && "bg-success/15 text-success",
        s === "finished" && "bg-secondary text-muted-foreground",
        s === "cancelled" && "bg-danger/15 text-danger",
        s === "postponed" && "bg-warning/15 text-warning",
      )}
    >
      {s === "live" && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
      {s === "live" ? "EN VIVO" : (EVENT_STATE_LABEL[s] ?? state)}
    </span>
  );
}

/** Seguir un partido: función premium. */
export function FollowHeart({
  pick,
  hasAccess,
  onUnlock,
}: {
  pick: Pick;
  hasAccess: boolean;
  onUnlock?: ((pick: Pick) => void) | undefined;
}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const { data: follows } = useFollows(user?.id);
  const toggle = useToggleFollow(user?.id);
  const following = (follows ?? []).includes(pick.id);

  return (
    <button
      type="button"
      aria-label="Seguir este partido"
      className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-gold"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          toast.info("Inicia sesión o regístrate para seguir equipos y partidos.");
          navigate({ to: "/auth", search: { redirect: `/picks/${pick.id}` } });
          return;
        }
        if (!hasAccess) {
          onUnlock?.(pick);
          return;
        }
        toggle.mutate({ pickId: pick.id, following });
      }}
    >
      <Heart className={cn("size-5", following && "fill-gold text-gold")} />
    </button>
  );
}

export function MetaLine({ pick }: { pick: Pick }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {SPORT_LABEL[pick.sport]} · {pick.league} · {PICK_TYPE_LABEL[pick.pick_type]}
    </span>
  );
}

export function Probabilities({ pick }: { pick: Pick }) {
  const items = [
    { label: "Local", value: pick.prob_home },
    { label: "Empate", value: pick.prob_draw },
    { label: "Visitante", value: pick.prob_away },
  ].filter((i) => i.value != null);

  if (items.length === 0) {
    return (
      <div>
        <div className="mb-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Confianza del modelo</span>
          <span className="font-semibold text-foreground">{pick.confidence}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-brand"
            style={{ width: `${pick.confidence}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 rounded-lg bg-secondary/60 px-2 py-1.5 text-center">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {i.label}
          </p>
          <p className="font-display text-base font-bold">{i.value}%</p>
        </div>
      ))}
    </div>
  );
}
