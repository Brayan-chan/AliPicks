import type { Tables } from "@/integrations/supabase/types";
import type { Pick, PickStatus } from "@/lib/alipicks";

export type PredictionKind = Tables<"pick_predictions">["kind"];
export type League = Tables<"leagues">;
export type Team = Tables<"teams">;
export type PickPrediction = Tables<"pick_predictions">;

/**
 * Lifecycle fields introduced by the postponement/rescheduling migrations.
 *
 * These live in the domain type explicitly so the frontend remains aligned with
 * the committed SQL migrations even if generated Supabase types were produced
 * from a local database that had not yet applied the latest migration set.
 * Once types.ts is regenerated from a fully migrated schema these properties
 * will be structurally identical and this intersection remains harmless.
 */
export type PickLifecycleFields = {
  postponement_reason: string | null;
  postponed_at: string | null;
  rescheduled_for: string | null;
};

export type StructuredPick = Pick &
  PickLifecycleFields & {
    league_ref: League | null;
    home_team_ref: Team | null;
    away_team_ref: Team | null;
    predictions: PickPrediction[];
  };

export function getPrediction(pick: StructuredPick, kind: PredictionKind) {
  return pick.predictions?.find((prediction) => prediction.kind === kind) ?? null;
}

export function getLeagueName(pick: StructuredPick) {
  return pick.league_ref?.name || pick.league || "Liga";
}

export function getMatchTeams(pick: StructuredPick) {
  if (pick.home_team_ref && pick.away_team_ref) {
    return {
      home: pick.home_team_ref,
      away: pick.away_team_ref,
      label: `${pick.home_team_ref.name} vs ${pick.away_team_ref.name}`,
    };
  }

  const legacy = pick.teams || "Partido";
  const parts = legacy.split(/\s+vs\.?\s+/i);
  return {
    home: null,
    away: null,
    label: legacy,
    legacyHome: parts.length === 2 ? parts[0]?.trim() : undefined,
    legacyAway: parts.length === 2 ? parts[1]?.trim() : undefined,
  };
}

export function getPrimaryPrediction(pick: StructuredPick): PickPrediction {
  const structured = getPrediction(pick, "primary");
  if (structured) return structured;
  return {
    id: `legacy-primary-${pick.id}`,
    pick_id: pick.id,
    kind: "primary",
    market_type: pick.pick_type,
    selection: pick.selection,
    line: null,
    predicted_home_score: null,
    predicted_away_score: null,
    confidence: pick.confidence,
    risk: pick.risk,
    odds: pick.odds,
    result: pick.status,
    created_at: pick.created_at,
    updated_at: pick.updated_at,
  };
}

export function getSecondaryPrediction(pick: StructuredPick): PickPrediction | null {
  const structured = getPrediction(pick, "secondary");
  if (structured) return structured;
  if (!pick.secondary_selection) return null;
  return {
    id: `legacy-secondary-${pick.id}`,
    pick_id: pick.id,
    kind: "secondary",
    market_type: pick.secondary_pick_type ?? pick.pick_type,
    selection: pick.secondary_selection,
    line: null,
    predicted_home_score: null,
    predicted_away_score: null,
    confidence: pick.secondary_confidence ?? 0,
    risk: pick.secondary_risk ?? pick.risk,
    odds: pick.secondary_odds,
    result: "pending" as PickStatus,
    created_at: pick.created_at,
    updated_at: pick.updated_at,
  };
}

export function getScorePrediction(
  pick: StructuredPick,
  kind: "primary_score" | "alt_score",
): PickPrediction | null {
  const structured = getPrediction(pick, kind);
  if (structured) return structured;

  const legacyScore = kind === "primary_score" ? pick.score_primary : pick.score_secondary;
  const confidence =
    kind === "primary_score" ? pick.score_primary_confidence : pick.score_secondary_confidence;
  if (!legacyScore) return null;
  const match = legacyScore.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
  if (!match) return null;

  return {
    id: `legacy-${kind}-${pick.id}`,
    pick_id: pick.id,
    kind,
    market_type: null,
    selection: null,
    line: null,
    predicted_home_score: Number(match[1]),
    predicted_away_score: Number(match[2]),
    confidence: confidence ?? 0,
    risk: null,
    odds: null,
    result: "pending" as PickStatus,
    created_at: pick.created_at,
    updated_at: pick.updated_at,
  };
}

export function primaryAccuracy(picks: StructuredPick[]) {
  const resolved = picks.filter((pick) => {
    const result = getPrimaryPrediction(pick).result;
    return result === "won" || result === "lost";
  });

  const won = resolved.filter((pick) => getPrimaryPrediction(pick).result === "won").length;
  return {
    rate: resolved.length ? Math.round((won / resolved.length) * 100) : 0,
    won,
    lost: resolved.length - won,
    total: resolved.length,
  };
}

export const primaryWinRate = primaryAccuracy;

export function primaryWeeklySeries(picks: StructuredPick[]) {
  const days: { day: string; rate: number; won: number; total: number }[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const end = start + 86400000;
    const dayPicks = picks.filter((pick) => {
      const eventTime = new Date(pick.event_at).getTime();
      const result = getPrimaryPrediction(pick).result;
      return eventTime >= start && eventTime < end && (result === "won" || result === "lost");
    });
    const won = dayPicks.filter((pick) => getPrimaryPrediction(pick).result === "won").length;
    days.push({
      day: new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(d),
      rate: dayPicks.length ? Math.round((won / dayPicks.length) * 100) : 0,
      won,
      total: dayPicks.length,
    });
  }

  return days;
}
