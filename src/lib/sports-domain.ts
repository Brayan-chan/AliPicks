import type { Pick, PickStatus, PickType, RiskLevel, Sport } from "@/lib/alipicks";

export type PredictionKind = "primary" | "secondary" | "primary_score" | "alt_score";

export type League = {
  id: string;
  sport: Sport;
  name: string;
  short_name: string | null;
  country: string | null;
  season: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export type Team = {
  id: string;
  sport: Sport;
  name: string;
  short_name: string | null;
  country: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export type PickPrediction = {
  id: string;
  pick_id: string;
  kind: PredictionKind;
  market_type: PickType | null;
  selection: string | null;
  line: number | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  confidence: number;
  risk: RiskLevel | null;
  odds: number | null;
  result: PickStatus;
  created_at: string;
  updated_at: string;
};

export type StructuredPick = Pick & {
  league_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  league: League | null;
  home_team: Team | null;
  away_team: Team | null;
  predictions: PickPrediction[];
};

export function getPrediction(pick: StructuredPick, kind: PredictionKind) {
  return pick.predictions?.find((prediction) => prediction.kind === kind) ?? null;
}

export function getLeagueName(pick: StructuredPick) {
  return pick.league?.name || (typeof pick.league === "string" ? pick.league : "Liga");
}

export function getMatchTeams(pick: StructuredPick) {
  if (pick.home_team && pick.away_team) {
    return {
      home: pick.home_team,
      away: pick.away_team,
      label: `${pick.home_team.name} vs ${pick.away_team.name}`,
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

export function getPrimaryPrediction(pick: StructuredPick) {
  const structured = getPrediction(pick, "primary");
  if (structured) return structured;
  return {
    id: `legacy-primary-${pick.id}`,
    pick_id: pick.id,
    kind: "primary" as const,
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

export function getSecondaryPrediction(pick: StructuredPick) {
  const structured = getPrediction(pick, "secondary");
  if (structured) return structured;
  if (!pick.secondary_selection) return null;
  return {
    id: `legacy-secondary-${pick.id}`,
    pick_id: pick.id,
    kind: "secondary" as const,
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

export function getScorePrediction(pick: StructuredPick, kind: "primary_score" | "alt_score") {
  const structured = getPrediction(pick, kind);
  if (structured) return structured;

  const legacyScore = kind === "primary_score" ? pick.score_primary : pick.score_secondary;
  const confidence = kind === "primary_score" ? pick.score_primary_confidence : pick.score_secondary_confidence;
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
