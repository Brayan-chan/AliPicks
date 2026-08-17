import type { Database } from "@/integrations/supabase/types";

export type Pick = Database["public"]["Tables"]["picks"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Purchase = Database["public"]["Tables"]["pick_purchases"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type PremiumContent = Database["public"]["Tables"]["pick_premium"]["Row"];
export type Sport = Database["public"]["Enums"]["sport"];
export type PickType = Database["public"]["Enums"]["pick_type"];
export type RiskLevel = Database["public"]["Enums"]["risk_level"];
export type PickStatus = Database["public"]["Enums"]["pick_status"];
export type Visibility = Database["public"]["Enums"]["visibility"];

export const SPORT_LABEL: Record<Sport, string> = { soccer: "Fútbol", mlb: "MLB" };

export const PICK_TYPE_LABEL: Record<PickType, string> = {
  "1x2": "Ganador (1X2)",
  over_under: "Total (Over/Under)",
  handicap: "Hándicap",
  marcador_exacto: "Marcador proyectado",
  parlay: "Escenario combinado",
  prop: "Proyección individual",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  bajo: "Riesgo bajo",
  medio: "Riesgo medio",
  alto: "Riesgo alto",
};

export const STATUS_LABEL: Record<PickStatus, string> = {
  pending: "Pendiente",
  won: "Acertada",
  lost: "No acertada",
  void: "Anulada",
};

export type EventState = "upcoming" | "live" | "finished" | "cancelled" | "postponed";

export const EVENT_STATE_LABEL: Record<EventState, string> = {
  upcoming: "Próximo",
  live: "En vivo",
  finished: "Finalizado",
  cancelled: "Cancelado",
  postponed: "Pospuesto",
};

export const TIER_LABEL: Record<number, string> = {
  0: "Gratuito",
  1: "Starter o superior",
  2: "Pro o VIP",
  3: "Solo VIP",
};

export const PLAN_TIER_NAME: Record<number, string> = {
  0: "Gratuito",
  1: "Starter",
  2: "Pro",
  3: "VIP",
};

export const PLAN_BENEFITS: Record<number, string[]> = {
  0: ["Predicciones gratuitas del día", "Análisis básico del partido", "Historial público de resultados"],
  1: ["Todo lo del plan Gratuito", "Más predicciones gratuitas y acceso a análisis Starter", "Pestañas de datos básicos (cuotas de referencia y totales)", "Seguimiento de partidos con favoritos"],
  2: ["Todo lo del plan Starter", "Todas las predicciones exclusivas de fútbol y MLB", "Análisis avanzado y los 6 factores analizados", "Marcadores proyectados y escenarios combinados", "Acceso completo a las pestañas de datos"],
  3: ["Todo lo del plan Pro", "Selección VIP de alto valor analítico", "Predicciones recomendadas destacadas", "Soporte prioritario"],
};

export type Factor = { title: string; color: string; text: string };
export type ExtraTab = { label: string; rows?: Record<string, string | number>[] | undefined; text?: string | undefined };

export function parseFactors(value: unknown): Factor[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null).map((f) => ({ title: String(f["title"] ?? ""), color: String(f["color"] ?? "#d8b45a"), text: String(f["text"] ?? "") })).filter((f) => f.title || f.text);
}

export function parseTabs(value: unknown): ExtraTab[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null).map((t) => ({ label: String(t["label"] ?? "Datos"), rows: Array.isArray(t["rows"]) ? (t["rows"] as Record<string, string | number>[]) : undefined, text: t["text"] != null ? String(t["text"]) : undefined }));
}

/** Cantidades en pesos mexicanos (MXN). */
export function money(cents: number) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(cents / 100); }
export function impliedProbability(odds: number | null | undefined) { if (!odds || odds <= 1) return null; return Math.round((100 / odds) * 10) / 10; }
export function confidenceOutOfTen(confidence: number) { return (Math.round((confidence / 10) * 10) / 10).toFixed(1); }
export function formatEventDate(iso: string) { return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
export function formatDateTime(iso: string) { return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }

export function accuracy(picks: Pick[]) {
  const resolved = picks.filter((p) => p.status === "won" || p.status === "lost");
  if (resolved.length === 0) return { rate: 0, won: 0, lost: 0, total: 0 };
  const won = resolved.filter((p) => p.status === "won").length;
  return { rate: Math.round((won / resolved.length) * 100), won, lost: resolved.length - won, total: resolved.length };
}
export const winRate = accuracy;
export function weeklySeries(picks: Pick[]) {
  const days: { day: string; rate: number; won: number; total: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); const end = start + 86400000;
    const dayPicks = picks.filter((p) => { const t = new Date(p.event_at).getTime(); return t >= start && t < end && (p.status === "won" || p.status === "lost"); });
    const won = dayPicks.filter((p) => p.status === "won").length;
    days.push({ day: new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(d), rate: dayPicks.length ? Math.round((won / dayPicks.length) * 100) : 0, won, total: dayPicks.length });
  }
  return days;
}
export function weeklyStats(picks: Pick[]) { const since = Date.now() - 7 * 86400000; const week = picks.filter((p) => new Date(p.event_at).getTime() >= since && (p.status === "won" || p.status === "lost")); return { ...accuracy(week), series: weeklySeries(picks) }; }
export function maskText(text: string) { return text.split(" ").map((w) => (w.length > 2 ? "**" : w)).join(" "); }
