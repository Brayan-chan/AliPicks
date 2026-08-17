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