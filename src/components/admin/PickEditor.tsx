import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  CircleCheckBig,
  Lock,
  Save,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  EVENT_STATE_LABEL,
  PICK_TYPE_LABEL,
  RISK_LABEL,
  SPORT_LABEL,
  STATUS_LABEL,
  parseFactors,
  type EventState,
  type Factor,
  type PickStatus,
  type PickType,
  type RiskLevel,
  type Sport,
} from "@/lib/alipicks";
import {
  getPrimaryPrediction,
  getScorePrediction,
  getSecondaryPrediction,
  type StructuredPick,
  type Team,
} from "@/lib/sports-domain";
import { useLeagueTeams, useLeagues } from "@/hooks/use-alipicks";
import { cn } from "@/lib/utils";

const DEFAULT_FACTORS: Factor[] = [
  { title: "Lo que está en juego", color: "#d8b45a", text: "" },
  { title: "Fuerza del equipo", color: "#4ea88a", text: "" },
  { title: "Lesiones y bajas", color: "#d96a5a", text: "" },
  { title: "Choque de estilos", color: "#6c9ad2", text: "" },
  { title: "Cuotas y líneas", color: "#b98cd6", text: "" },
  { title: "Forma local / visitante", color: "#e0995a", text: "" },
];

const MARKET_OPTIONS = Object.entries(PICK_TYPE_LABEL).filter(
  ([key]) => key !== "marcador_exacto",
) as [PickType, string][];

const TERMINAL_STATES = new Set<EventState>(["finished", "cancelled"]);

const STATE_TRANSITIONS: Record<EventState, EventState[]> = {
  upcoming: ["upcoming", "live", "postponed", "cancelled", "finished"],
  live: ["live", "postponed", "cancelled", "finished"],
  postponed: ["postponed", "upcoming", "cancelled"],
  finished: ["finished"],
  cancelled: ["cancelled"],
};

type Draft = {
  sport: Sport;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  eventAt: string;
  eventState: EventState;
  postponementReason: string;
  postponedAt: string;
  rescheduledFor: string;
  homeScore: string;
  awayScore: string;
  probHome: string;
  probDraw: string;
  probAway: string;
  analysis: string;
  primaryMarket: PickType;
  primarySelection: string;
  primaryRisk: RiskLevel;
  primaryConfidence: string;
  primaryOdds: string;
  primaryResult: PickStatus;
  secondaryMarket: PickType;
  secondarySelection: string;
  secondaryRisk: RiskLevel;
  secondaryConfidence: string;
  secondaryOdds: string;
  secondaryResult: PickStatus;
  primaryScoreHome: string;
  primaryScoreAway: string;
  primaryScoreConfidence: string;
  primaryScoreResult: PickStatus;
  altScoreHome: string;
  altScoreAway: string;
  altScoreConfidence: string;
  altScoreResult: PickStatus;
  factors: Factor[];
  visibility: "free" | "premium";
  minPlanTier: number;
  priceCents: number;
  tags: string;
  isPublished: boolean;
  featured: boolean;
  recommended: boolean;
};

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyDraft(): Draft {
  return {
    sport: "soccer",
    leagueId: "",
    homeTeamId: "",
    awayTeamId: "",
    eventAt: toLocalInput(new Date(Date.now() + 86400000).toISOString()),
    eventState: "upcoming",
    postponementReason: "",
    postponedAt: "",
    rescheduledFor: "",
    homeScore: "",
    awayScore: "",
    probHome: "",
    probDraw: "",
    probAway: "",
    analysis: "",
    primaryMarket: "1x2",
    primarySelection: "",
    primaryRisk: "bajo",
    primaryConfidence: "70",
    primaryOdds: "",
    primaryResult: "pending",
    secondaryMarket: "over_under",
    secondarySelection: "",
    secondaryRisk: "medio",
    secondaryConfidence: "60",
    secondaryOdds: "",
    secondaryResult: "pending",
    primaryScoreHome: "",
    primaryScoreAway: "",
    primaryScoreConfidence: "30",
    primaryScoreResult: "pending",
    altScoreHome: "",
    altScoreAway: "",
    altScoreConfidence: "20",
    altScoreResult: "pending",
    factors: DEFAULT_FACTORS.map((factor) => ({ ...factor })),
    visibility: "premium",
    minPlanTier: 1,
    priceCents: 299,
    tags: "",
    isPublished: true,
    featured: false,
    recommended: false,
  };
}

function draftFromPick(pick: StructuredPick): Draft {
  const primary = getPrimaryPrediction(pick);
  const secondary = getSecondaryPrediction(pick);
  const primaryScore = getScorePrediction(pick, "primary_score");
  const altScore = getScorePrediction(pick, "alt_score");
  const factors = parseFactors(pick.factors);

  return {
    ...emptyDraft(),
    sport: pick.sport,
    leagueId: pick.league_id ?? pick.league_ref?.id ?? "",
    homeTeamId: pick.home_team_id ?? pick.home_team_ref?.id ?? "",
    awayTeamId: pick.away_team_id ?? pick.away_team_ref?.id ?? "",
    eventAt: toLocalInput(pick.event_at),
    eventState: pick.event_state as EventState,
    postponementReason: pick.postponement_reason ?? "",
    postponedAt: pick.postponed_at ?? "",
    rescheduledFor: pick.rescheduled_for ? toLocalInput(pick.rescheduled_for) : "",
    homeScore: pick.home_score?.toString() ?? "",
    awayScore: pick.away_score?.toString() ?? "",
    probHome: pick.prob_home?.toString() ?? "",
    probDraw: pick.prob_draw?.toString() ?? "",
    probAway: pick.prob_away?.toString() ?? "",
    analysis: pick.basic_analysis ?? pick.short_description ?? "",
    primaryMarket: primary.market_type ?? "1x2",
    primarySelection: primary.selection ?? "",
    primaryRisk: primary.risk ?? "bajo",
    primaryConfidence: String(primary.confidence ?? 70),
    primaryOdds: primary.odds?.toString() ?? "",
    primaryResult: primary.result,
    secondaryMarket: secondary?.market_type ?? "over_under",
    secondarySelection: secondary?.selection ?? "",
    secondaryRisk: secondary?.risk ?? "medio",
    secondaryConfidence: String(secondary?.confidence ?? 60),
    secondaryOdds: secondary?.odds?.toString() ?? "",
    secondaryResult: secondary?.result ?? "pending",
    primaryScoreHome: primaryScore?.predicted_home_score?.toString() ?? "",
    primaryScoreAway: primaryScore?.predicted_away_score?.toString() ?? "",
    primaryScoreConfidence: String(primaryScore?.confidence ?? 30),
    primaryScoreResult: primaryScore?.result ?? "pending",
    altScoreHome: altScore?.predicted_home_score?.toString() ?? "",
    altScoreAway: altScore?.predicted_away_score?.toString() ?? "",
    altScoreConfidence: String(altScore?.confidence ?? 20),
    altScoreResult: altScore?.result ?? "pending",
    factors: DEFAULT_FACTORS.map((factor, index) => factors[index] ?? { ...factor }),
    visibility: pick.visibility,
    minPlanTier: pick.min_plan_tier,
    priceCents: pick.price_cents,
    tags: pick.tags.join(", "),
    isPublished: pick.is_published,
    featured: pick.featured,
    recommended: pick.recommended,
  };
}

function asPercent(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function positiveInt(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value);
}

function scoreResult(
  predictedHome: string,
  predictedAway: string,
  realHome: string,
  realAway: string,
): PickStatus {
  const predictedHomeScore = positiveInt(predictedHome);
  const predictedAwayScore = positiveInt(predictedAway);
  const realHomeScore = positiveInt(realHome);
  const realAwayScore = positiveInt(realAway);
  if (
    predictedHomeScore == null ||
    predictedAwayScore == null ||
    realHomeScore == null ||
    realAwayScore == null
  ) {
    return "pending";
  }
  return predictedHomeScore === realHomeScore && predictedAwayScore === realAwayScore
    ? "won"
    : "lost";
}

function allPredictionResults(draft: Draft) {
  return [
    draft.primaryResult,
    draft.secondaryResult,
    draft.primaryScoreResult,
    draft.altScoreResult,
  ];
}

export function PickEditor({ pick }: { pick?: StructuredPick }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => (pick ? draftFromPick(pick) : emptyDraft()));
  const [busy, setBusy] = useState(false);
  const { data: leagues = [] } = useLeagues(draft.sport);
  const { data: teams = [] } = useLeagueTeams(draft.leagueId || undefined);

  const selectedLeague =
    leagues.find((league) => league.id === draft.leagueId) ?? pick?.league_ref ?? null;
  const selectedHome =
    teams.find((team) => team.id === draft.homeTeamId) ?? pick?.home_team_ref ?? null;
  const selectedAway =
    teams.find((team) => team.id === draft.awayTeamId) ?? pick?.away_team_ref ?? null;

  const probabilityTotal = useMemo(
    () => Number(draft.probHome || 0) + Number(draft.probDraw || 0) + Number(draft.probAway || 0),
    [draft.probHome, draft.probDraw, draft.probAway],
  );

  const definitionLocked = Boolean(pick?.predictions_locked_at);
  const terminalPick = Boolean(pick && TERMINAL_STATES.has(pick.event_state as EventState));
  const canResolve = draft.eventState === "finished" || draft.eventState === "cancelled";
  const resolvedCount = allPredictionResults(draft).filter((result) => result !== "pending").length;
  const availableStates = pick
    ? STATE_TRANSITIONS[pick.event_state as EventState]
    : STATE_TRANSITIONS.upcoming;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function resetPredictionResults(current: Draft): Draft {
    return {
      ...current,
      primaryResult: "pending",
      secondaryResult: "pending",
      primaryScoreResult: "pending",
      altScoreResult: "pending",
    };
  }

  function changeSport(sport: Sport) {
    if (definitionLocked) return;
    setDraft((current) => ({
      ...current,
      sport,
      leagueId: "",
      homeTeamId: "",
      awayTeamId: "",
      probDraw: sport === "mlb" ? "" : current.probDraw,
    }));
  }

  function changeLeague(leagueId: string) {
    if (definitionLocked) return;
    setDraft((current) => ({ ...current, leagueId, homeTeamId: "", awayTeamId: "" }));
  }

  function applyExactScoreResults(current: Draft) {
    return {
      ...current,
      primaryScoreResult: scoreResult(
        current.primaryScoreHome,
        current.primaryScoreAway,
        current.homeScore,
        current.awayScore,
      ),
      altScoreResult: scoreResult(
        current.altScoreHome,
        current.altScoreAway,
        current.homeScore,
        current.awayScore,
      ),
    };
  }

  function changeEventState(eventState: EventState) {
    setDraft((current) => {
      if (eventState === "cancelled") {
        return {
          ...current,
          eventState,
          postponementReason: "",
          postponedAt: "",
          rescheduledFor: "",
          homeScore: "",
          awayScore: "",
          primaryResult: "void",
          secondaryResult: "void",
          primaryScoreResult: "void",
          altScoreResult: "void",
        };
      }

      if (eventState === "postponed") {
        return {
          ...resetPredictionResults(current),
          eventState,
          postponedAt: current.postponedAt || new Date().toISOString(),
          homeScore: "",
          awayScore: "",
        };
      }

      let next: Draft = {
        ...current,
        eventState,
        postponementReason: "",
        postponedAt: "",
        rescheduledFor: "",
      };
      if (current.eventState === "postponed") next = resetPredictionResults(next);
      if (eventState === "finished") next = applyExactScoreResults(next);
      return next;
    });
  }

  function changeRealScore(side: "home" | "away", value: string) {
    setDraft((current) => {
      const next = {
        ...current,
        [side === "home" ? "homeScore" : "awayScore"]: value,
      } as Draft;
      return next.eventState === "finished" ? applyExactScoreResults(next) : next;
    });
  }

  function finishMatch() {
    if (positiveInt(draft.homeScore) == null || positiveInt(draft.awayScore) == null) {
      toast.error("Completa el marcador real antes de finalizar el partido.");
      return;
    }
    setDraft((current) =>
      applyExactScoreResults({
        ...current,
        eventState: "finished",
        postponementReason: "",
        postponedAt: "",
        rescheduledFor: "",
      }),
    );
    toast.success(
      "Partido listo para cierre. Revisa Primary y Secondary; los scores se resolverán automáticamente.",
    );
  }

  function reactivatePostponedMatch() {
    if (!draft.rescheduledFor) {
      toast.error("Registra la nueva fecha y hora antes de reactivar el partido.");
      return;
    }
    const nextDate = new Date(draft.rescheduledFor);
    if (Number.isNaN(nextDate.getTime())) {
      toast.error("La nueva fecha y hora no son válidas.");
      return;
    }
    setDraft((current) =>
      resetPredictionResults({
        ...current,
        eventAt: current.rescheduledFor,
        eventState: "upcoming",
        postponementReason: "",
        postponedAt: "",
        rescheduledFor: "",
        homeScore: "",
        awayScore: "",
      }),
    );
    toast.success("Partido reprogramado. La nueva fecha pasa a ser la fecha oficial del evento.");
  }

  function validationError() {
    if (!draft.leagueId || !draft.homeTeamId || !draft.awayTeamId)
      return "Selecciona liga, equipo local y equipo visitante.";
    if (draft.homeTeamId === draft.awayTeamId)
      return "El equipo local y visitante deben ser distintos.";
    if (!draft.eventAt) return "Selecciona fecha y hora del partido.";
    if (!draft.analysis.trim()) return "Escribe el análisis del partido.";
    if (!draft.primarySelection.trim() || !draft.secondarySelection.trim())
      return "Primary Pick y Secondary Pick son obligatorios.";
    if (Number(draft.primaryOdds) <= 1 || Number(draft.secondaryOdds) <= 1)
      return "Las cuotas de Primary y Secondary deben ser mayores a 1.00.";
    if (asPercent(draft.primaryConfidence) == null || asPercent(draft.secondaryConfidence) == null)
      return "Las confianzas de Primary y Secondary deben estar entre 0 y 100.";
    if (
      positiveInt(draft.primaryScoreHome) == null ||
      positiveInt(draft.primaryScoreAway) == null ||
      positiveInt(draft.altScoreHome) == null ||
      positiveInt(draft.altScoreAway) == null
    ) {
      return "Primary Score y Alt Score deben tener marcadores válidos.";
    }
    if (
      asPercent(draft.primaryScoreConfidence) == null ||
      asPercent(draft.altScoreConfidence) == null
    ) {
      return "Las confianzas de los marcadores deben estar entre 0 y 100.";
    }

    const home = asPercent(draft.probHome);
    const away = asPercent(draft.probAway);
    const draw =
      draft.sport === "soccer"
        ? asPercent(draft.probDraw)
        : draft.probDraw.trim()
          ? asPercent(draft.probDraw)
          : null;
    if (home == null || away == null || (draft.sport === "soccer" && draw == null))
      return "Completa correctamente las probabilidades del partido.";
    if (Math.abs(probabilityTotal - 100) > 0.001)
      return "Las probabilidades deben sumar exactamente 100%.";
    if (draft.factors.some((factor) => !factor.text.trim()))
      return "Completa los seis factores del análisis.";

    const hasAnyRealScore = Boolean(draft.homeScore.trim() || draft.awayScore.trim());
    const hasCompleteRealScore =
      positiveInt(draft.homeScore) != null && positiveInt(draft.awayScore) != null;
    if (hasAnyRealScore && !hasCompleteRealScore)
      return "Si registras un marcador real, completa ambos equipos.";
    if (draft.eventState === "finished" && !hasCompleteRealScore)
      return "Un partido finalizado debe tener marcador real completo.";
    if (draft.eventState === "cancelled" && hasAnyRealScore)
      return "Un partido cancelado no debe tener marcador real.";
    if (
      draft.eventState === "finished" &&
      (draft.primaryResult === "pending" || draft.secondaryResult === "pending")
    ) {
      return "Antes de cerrar el partido, resuelve Primary Pick y Secondary Pick.";
    }
    if (
      draft.eventState === "cancelled" &&
      allPredictionResults(draft).some((result) => result !== "void")
    ) {
      return "Las cuatro proyecciones de un partido cancelado deben quedar anuladas.";
    }
    if (
      (draft.eventState === "upcoming" ||
        draft.eventState === "live" ||
        draft.eventState === "postponed") &&
      allPredictionResults(draft).some((result) => result !== "pending")
    ) {
      return "Las proyecciones deben permanecer pendientes mientras el evento no haya terminado.";
    }
    if (draft.eventState === "postponed" && !draft.postponedAt)
      return "No se pudo registrar cuándo se pospuso el partido.";
    if (draft.rescheduledFor && Number.isNaN(new Date(draft.rescheduledFor).getTime()))
      return "La nueva fecha programada no es válida.";
    return null;
  }

  function buildPickPayload(eventState = draft.eventState, forcePending = false): Json {
    const analysis = draft.analysis.trim();
    const shortDescription = analysis.length > 280 ? `${analysis.slice(0, 277)}...` : analysis;
    const hasRealScore =
      positiveInt(draft.homeScore) != null && positiveInt(draft.awayScore) != null;
    const tags = draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const publishedAt = draft.isPublished
      ? (pick?.published_at ?? new Date().toISOString())
      : null;
    const primaryResult = forcePending ? "pending" : draft.primaryResult;

    return {
      sport: draft.sport,
      league_id: draft.leagueId,
      home_team_id: draft.homeTeamId,
      away_team_id: draft.awayTeamId,
      home_score: hasRealScore ? Number(draft.homeScore) : null,
      away_score: hasRealScore ? Number(draft.awayScore) : null,
      event_at: new Date(draft.eventAt).toISOString(),
      event_state: eventState,
      postponement_reason:
        eventState === "postponed" ? draft.postponementReason.trim() || null : null,
      postponed_at: eventState === "postponed" && draft.postponedAt ? draft.postponedAt : null,
      rescheduled_for:
        eventState === "postponed" && draft.rescheduledFor
          ? new Date(draft.rescheduledFor).toISOString()
          : null,
      prob_home: Number(draft.probHome),
      prob_draw: draft.probDraw.trim() ? Number(draft.probDraw) : null,
      prob_away: Number(draft.probAway),
      basic_analysis: analysis,
      short_description: shortDescription,
      factors: draft.factors as unknown as Json,
      visibility: draft.visibility,
      min_plan_tier: draft.visibility === "free" ? 0 : draft.minPlanTier,
      price_cents: draft.priceCents,
      tags,
      is_published: draft.isPublished,
      featured: draft.featured,
      recommended: draft.recommended,
      published_at: publishedAt,
      final_result:
        eventState === "finished" && hasRealScore
          ? `${draft.homeScore}-${draft.awayScore}`
          : null,
      pick_type: draft.primaryMarket,
      selection: draft.primarySelection.trim(),
      risk: draft.primaryRisk,
      confidence: Number(draft.primaryConfidence),
      odds: Number(draft.primaryOdds),
      status: primaryResult,
      secondary_selection: draft.secondarySelection.trim(),
      secondary_pick_type: draft.secondaryMarket,
      secondary_risk: draft.secondaryRisk,
      secondary_confidence: Number(draft.secondaryConfidence),
      secondary_odds: Number(draft.secondaryOdds),
      score_primary: `${draft.primaryScoreHome}-${draft.primaryScoreAway}`,
      score_primary_confidence: Number(draft.primaryScoreConfidence),
      score_secondary: `${draft.altScoreHome}-${draft.altScoreAway}`,
      score_secondary_confidence: Number(draft.altScoreConfidence),
    };
  }

  function buildPredictions(forcePending = false): Json {
    const result = (value: PickStatus): PickStatus => (forcePending ? "pending" : value);
    return [
      {
        kind: "primary",
        market_type: draft.primaryMarket,
        selection: draft.primarySelection.trim(),
        line: null,
        predicted_home_score: null,
        predicted_away_score: null,
        confidence: Number(draft.primaryConfidence),
        risk: draft.primaryRisk,
        odds: Number(draft.primaryOdds),
        result: result(draft.primaryResult),
      },
      {
        kind: "secondary",
        market_type: draft.secondaryMarket,
        selection: draft.secondarySelection.trim(),
        line: null,
        predicted_home_score: null,
        predicted_away_score: null,
        confidence: Number(draft.secondaryConfidence),
        risk: draft.secondaryRisk,
        odds: Number(draft.secondaryOdds),
        result: result(draft.secondaryResult),
      },
      {
        kind: "primary_score",
        market_type: null,
        selection: null,
        line: null,
        predicted_home_score: Number(draft.primaryScoreHome),
        predicted_away_score: Number(draft.primaryScoreAway),
        confidence: Number(draft.primaryScoreConfidence),
        risk: null,
        odds: null,
        result: result(draft.primaryScoreResult),
      },
      {
        kind: "alt_score",
        market_type: null,
        selection: null,
        line: null,
        predicted_home_score: Number(draft.altScoreHome),
        predicted_away_score: Number(draft.altScoreAway),
        confidence: Number(draft.altScoreConfidence),
        risk: null,
        odds: null,
        result: result(draft.altScoreResult),
      },
    ];
  }

  async function saveStructuredPick(eventState = draft.eventState, forcePending = false) {
    const rpcArgs = pick
      ? {
          p_pick: buildPickPayload(eventState, forcePending),
          p_predictions: buildPredictions(forcePending),
          p_pick_id: pick.id,
        }
      : {
          p_pick: buildPickPayload(eventState, forcePending),
          p_predictions: buildPredictions(forcePending),
        };

    const { data, error } = await supabase.rpc("save_structured_pick", rpcArgs);
    if (error) throw error;
    if (!data) throw new Error("La transacción terminó sin devolver el id del pick.");
    return data;
  }

  async function settlePick() {
    if (!pick) throw new Error("No se puede resolver un pick que todavía no existe.");

    // Only an unlocked pre-match pick may persist a final definition immediately
    // before settlement. Once predictions_locked_at exists we never route through
    // save_structured_pick again, preserving partial live scores and the original
    // prediction definition for the settlement audit trail.
    if (!definitionLocked && !TERMINAL_STATES.has(pick.event_state as EventState)) {
      await saveStructuredPick(pick.event_state as EventState, true);
    }

    const homeScore = draft.eventState === "finished" ? positiveInt(draft.homeScore) : null;
    const awayScore = draft.eventState === "finished" ? positiveInt(draft.awayScore) : null;

    const args =
      draft.eventState === "finished"
        ? {
            p_pick_id: pick.id,
            p_event_state: "finished",
            p_home_score: homeScore ?? 0,
            p_away_score: awayScore ?? 0,
            p_primary_result: draft.primaryResult,
            p_secondary_result: draft.secondaryResult,
          }
        : {
            p_pick_id: pick.id,
            p_event_state: "cancelled",
          };

    const { data, error } = await supabase.rpc("settle_structured_pick", args);
    if (error) throw error;
    if (!data) throw new Error("El cierre terminó sin devolver el id del pick.");
    return data;
  }

  async function save() {
    const invalid = validationError();
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (!selectedLeague || !selectedHome || !selectedAway) {
      toast.error("No se pudieron resolver las entidades seleccionadas.");
      return;
    }

    setBusy(true);
    try {
      if (pick && TERMINAL_STATES.has(draft.eventState)) {
        await settlePick();
        toast.success(
          draft.eventState === "finished"
            ? "Partido cerrado y auditado"
            : "Partido cancelado y auditado",
        );
      } else {
        await saveStructuredPick();
        toast.success(pick ? "Pick actualizado" : "Pick creado correctamente");
      }
      navigate({ to: "/admin" });
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("active member of the selected league"))
        toast.error("Uno de los equipos ya no pertenece activamente a la liga seleccionada.");
      else if (message.includes("admin role required"))
        toast.error("Tu sesión ya no tiene permisos de administrador.");
      else if (message.includes("prediction definition is locked"))
        toast.error("Las predicciones ya están bloqueadas porque el partido comenzó.");
      else if (message.includes("cannot transition"))
        toast.error("Ese cambio de estado ya no está permitido para este partido.");
      else if (message.includes("settlement"))
        toast.error("No se pudo cerrar el partido con esos resultados.");
      else if (message.includes("postponed"))
        toast.error("Los datos de posposición o reprogramación no son coherentes.");
      else
        toast.error(
          "No se pudo guardar el pick. La operación fue revertida o quedó en su último estado válido.",
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {definitionLocked && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
            <div className="flex gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-display text-sm font-bold">Predicciones bloqueadas</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  El partido ya comenzó o alcanzó un estado terminal. Mercado, selección, riesgo,
                  confianza, cuota y scores proyectados conservan exactamente la definición que
                  tenía el modelo al bloquearse.
                </p>
                {pick?.predictions_locked_at && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Bloqueadas:{" "}
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(pick.predictions_locked_at))}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {terminalPick && (
          <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4 text-xs text-muted-foreground">
            Este evento ya es terminal. El editor queda orientado a corregir únicamente su
            settlement; no puede reabrirse como partido próximo o en vivo.
          </div>
        )}

        <EditorSection
          title="1. Partido"
          description="Selecciona liga y equipos. El estado, reprogramación y marcador se administran sin rehacer las predicciones."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Deporte">
              <Select
                value={draft.sport}
                disabled={definitionLocked}
                onValueChange={(value) => changeSport(value as Sport)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SPORT_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <EntityPicker
              label="Liga"
              placeholder="Buscar liga…"
              value={draft.leagueId}
              options={leagues}
              getLabel={(league) => league.name}
              onChange={changeLeague}
              disabled={definitionLocked}
            />
            <EntityPicker
              label="Equipo local"
              placeholder="Buscar equipo local…"
              value={draft.homeTeamId}
              options={teams.filter((team) => team.id !== draft.awayTeamId)}
              getLabel={(team) => team.name}
              image={(team) => team.logo_url}
              onChange={(value) => set("homeTeamId", value)}
              disabled={definitionLocked || !draft.leagueId}
            />
            <EntityPicker
              label="Equipo visitante"
              placeholder="Buscar equipo visitante…"
              value={draft.awayTeamId}
              options={teams.filter((team) => team.id !== draft.homeTeamId)}
              getLabel={(team) => team.name}
              image={(team) => team.logo_url}
              onChange={(value) => set("awayTeamId", value)}
              disabled={definitionLocked || !draft.leagueId}
            />

            <Field
              label={draft.eventState === "postponed" ? "Fecha original" : "Fecha y hora"}
              hint={
                draft.eventState === "postponed"
                  ? "Se conserva como referencia mientras está pospuesto."
                  : ""
              }
            >
              <Input
                type="datetime-local"
                disabled={definitionLocked || draft.eventState === "postponed"}
                value={draft.eventAt}
                onChange={(event) => set("eventAt", event.target.value)}
              />
            </Field>

            <Field label="Estado del partido">
              <Select
                value={draft.eventState}
                onValueChange={(value) => changeEventState(value as EventState)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStates.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EVENT_STATE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {draft.eventState === "postponed" && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">Partido pospuesto</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Las proyecciones se conservan. Si el evento ya había comenzado, permanecen
                    bloqueadas incluso durante la reprogramación.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Motivo" hint="Opcional. Ej. lluvia, seguridad, logística.">
                      <Input
                        value={draft.postponementReason}
                        onChange={(event) => set("postponementReason", event.target.value)}
                        placeholder="Motivo de la posposición"
                      />
                    </Field>
                    <Field
                      label="Nueva fecha y hora"
                      hint="Déjala vacía si todavía está por confirmar."
                    >
                      <Input
                        type="datetime-local"
                        value={draft.rescheduledFor}
                        onChange={(event) => set("rescheduledFor", event.target.value)}
                      />
                    </Field>
                  </div>

                  {pick?.event_state === "postponed" ? (
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!draft.rescheduledFor}
                        onClick={reactivatePostponedMatch}
                      >
                        <CalendarClock className="size-4" /> Reprogramar como próximo
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Guarda primero la posposición. La reprogramación se habilitará cuando el
                      estado Pospuesto ya esté registrado en la base.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Marcador real local"
              hint={
                draft.eventState === "live"
                  ? "Puedes registrar el marcador parcial."
                  : "Déjalo vacío antes del partido."
              }
            >
              <Input
                type="number"
                min={0}
                disabled={draft.eventState === "cancelled" || draft.eventState === "postponed"}
                value={draft.homeScore}
                onChange={(event) => changeRealScore("home", event.target.value)}
              />
            </Field>
            <Field label="Marcador real visitante">
              <Input
                type="number"
                min={0}
                disabled={draft.eventState === "cancelled" || draft.eventState === "postponed"}
                value={draft.awayScore}
                onChange={(event) => changeRealScore("away", event.target.value)}
              />
            </Field>
          </div>

          {draft.eventState !== "cancelled" &&
            draft.eventState !== "finished" &&
            draft.eventState !== "postponed" && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 p-4">
                <div>
                  <p className="text-sm font-semibold">¿Terminó el partido?</p>
                  <p className="text-xs text-muted-foreground">
                    Registra el marcador y AliPicks calculará automáticamente los dos scores.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={finishMatch}>
                  <CircleCheckBig className="size-4" /> Finalizar partido
                </Button>
              </div>
            )}
        </EditorSection>

        <EditorSection
          title="2. Probabilidades del modelo"
          description="La suma debe ser exactamente 100%."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Local %">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.probHome}
                onChange={(event) => set("probHome", event.target.value)}
                disabled={terminalPick}
              />
            </Field>
            {draft.sport === "soccer" && (
              <Field label="Empate %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.probDraw}
                  onChange={(event) => set("probDraw", event.target.value)}
                  disabled={terminalPick}
                />
              </Field>
            )}
            <Field label="Visitante %">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.probAway}
                onChange={(event) => set("probAway", event.target.value)}
                disabled={terminalPick}
              />
            </Field>
          </div>
          <p
            className={cn(
              "mt-3 text-xs font-semibold",
              probabilityTotal === 100 ? "text-success" : "text-destructive",
            )}
          >
            Total: {probabilityTotal}%
          </p>
        </EditorSection>

        <EditorSection
          title="3. Predicciones"
          description="Primary y Secondary se resuelven al cerrar el evento. Los scores son proyecciones analíticas sin riesgo ni cuota."
        >
          {definitionLocked && (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <p>
                La definición del modelo ya es inmutable. Solo los resultados del settlement pueden
                cambiar.
              </p>
            </div>
          )}

          {canResolve && (
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold">Resolución del evento</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.eventState === "cancelled"
                  ? "Las cuatro proyecciones se anularán al guardar."
                  : `${resolvedCount}/4 resultados preparados. Decide Primary y Secondary; los scores se calculan por marcador.`}
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <BetPrediction
              title="Primary Pick"
              market={draft.primaryMarket}
              selection={draft.primarySelection}
              risk={draft.primaryRisk}
              confidence={draft.primaryConfidence}
              odds={draft.primaryOdds}
              result={draft.primaryResult}
              definitionDisabled={definitionLocked}
              resultDisabled={!canResolve || draft.eventState === "cancelled"}
              onMarket={(value) => set("primaryMarket", value)}
              onSelection={(value) => set("primarySelection", value)}
              onRisk={(value) => set("primaryRisk", value)}
              onConfidence={(value) => set("primaryConfidence", value)}
              onOdds={(value) => set("primaryOdds", value)}
              onResult={(value) => set("primaryResult", value)}
            />
            <BetPrediction
              title="Secondary Pick"
              market={draft.secondaryMarket}
              selection={draft.secondarySelection}
              risk={draft.secondaryRisk}
              confidence={draft.secondaryConfidence}
              odds={draft.secondaryOdds}
              result={draft.secondaryResult}
              definitionDisabled={definitionLocked}
              resultDisabled={!canResolve || draft.eventState === "cancelled"}
              onMarket={(value) => set("secondaryMarket", value)}
              onSelection={(value) => set("secondarySelection", value)}
              onRisk={(value) => set("secondaryRisk", value)}
              onConfidence={(value) => set("secondaryConfidence", value)}
              onOdds={(value) => set("secondaryOdds", value)}
              onResult={(value) => set("secondaryResult", value)}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ScorePrediction
              title="Primary Score"
              home={draft.primaryScoreHome}
              away={draft.primaryScoreAway}
              confidence={draft.primaryScoreConfidence}
              result={draft.primaryScoreResult}
              definitionDisabled={definitionLocked}
              onHome={(value) => set("primaryScoreHome", value)}
              onAway={(value) => set("primaryScoreAway", value)}
              onConfidence={(value) => set("primaryScoreConfidence", value)}
            />
            <ScorePrediction
              title="Alt Score"
              home={draft.altScoreHome}
              away={draft.altScoreAway}
              confidence={draft.altScoreConfidence}
              result={draft.altScoreResult}
              definitionDisabled={definitionLocked}
              onHome={(value) => set("altScoreHome", value)}
              onAway={(value) => set("altScoreAway", value)}
              onConfidence={(value) => set("altScoreConfidence", value)}
            />
          </div>
        </EditorSection>

        <EditorSection
          title="4. Análisis"
          description="Explica por qué el modelo llega a estas proyecciones."
        >
          <Textarea
            rows={8}
            value={draft.analysis}
            disabled={terminalPick}
            onChange={(event) => set("analysis", event.target.value)}
            placeholder="Explica por qué el modelo llega a estas proyecciones…"
          />
        </EditorSection>

        <EditorSection
          title="5. Seis factores"
          description="Los factores documentan el contexto utilizado por el modelo."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {draft.factors.map((factor, index) => (
              <div
                key={factor.title}
                className="rounded-xl border border-border/70 bg-secondary/20 p-4"
                style={{ borderLeft: `3px solid ${factor.color}` }}
              >
                <Label className="text-sm font-semibold">{factor.title}</Label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  disabled={terminalPick}
                  value={factor.text}
                  onChange={(event) =>
                    set(
                      "factors",
                      draft.factors.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, text: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="6. Publicación" description="Configura acceso y visibilidad del pick.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Acceso">
              <Select
                value={draft.visibility}
                disabled={terminalPick}
                onValueChange={(value) => set("visibility", value as Draft["visibility"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Acceso libre</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plan mínimo">
              <Input
                type="number"
                min={0}
                max={3}
                disabled={terminalPick || draft.visibility === "free"}
                value={draft.visibility === "free" ? 0 : draft.minPlanTier}
                onChange={(event) => set("minPlanTier", Number(event.target.value))}
              />
            </Field>
            <Field label="Precio individual (centavos MXN)">
              <Input
                type="number"
                min={0}
                disabled={terminalPick}
                value={draft.priceCents}
                onChange={(event) => set("priceCents", Number(event.target.value))}
              />
            </Field>
            <Field label="Etiquetas">
              <Input
                disabled={terminalPick}
                value={draft.tags}
                onChange={(event) => set("tags", event.target.value)}
                placeholder="champions, value, goles"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-5">
            <CheckField
              label="Publicado"
              checked={draft.isPublished}
              disabled={terminalPick}
              onChange={(value) => set("isPublished", value)}
            />
            <CheckField
              label="Destacado"
              checked={draft.featured}
              disabled={terminalPick}
              onChange={(value) => set("featured", value)}
            />
            <CheckField
              label="Recomendado"
              checked={draft.recommended}
              disabled={terminalPick}
              onChange={(value) => set("recommended", value)}
            />
          </div>
        </EditorSection>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate({ to: "/admin" })}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="min-w-40 bg-gradient-brand text-primary-foreground"
          >
            <Save className="size-4" />{" "}
            {busy
              ? "Guardando…"
              : canResolve && pick
                ? "Guardar cierre"
                : pick
                  ? "Guardar cambios"
                  : "Crear pick"}
          </Button>
        </div>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="surface-card rounded-2xl border border-border/70 p-5">
          <p className="eyebrow">Preview del partido</p>
          <div className="mt-5 flex items-center gap-3">
            <TeamPreview team={selectedHome} fallback="Local" />
            <div className="shrink-0 text-center">
              <p className="font-display text-2xl font-extrabold">
                {draft.homeScore || 0} - {draft.awayScore || 0}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {EVENT_STATE_LABEL[draft.eventState]}
              </p>
            </div>
            <TeamPreview team={selectedAway} fallback="Visitante" />
          </div>
          <div className="mt-5 rounded-xl bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">
              {selectedLeague?.name ?? "Selecciona una liga"}
            </p>
            <p className="mt-3 text-sm font-semibold">Primary Pick</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.primarySelection || "Sin selección"}
            </p>
            <p className="mt-3 text-sm font-semibold">Secondary Pick</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.secondarySelection || "Sin selección"}
            </p>
          </div>
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Primary Score y Alt Score son proyecciones analíticas. No muestran cuota ni etiqueta
              de riesgo.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card rounded-2xl border border-border/70 p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CheckField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", disabled && "opacity-60")}>
      <Checkbox
        disabled={disabled}
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
      />{" "}
      {label}
    </label>
  );
}

function EntityPicker<T extends { id: string }>({
  label,
  placeholder,
  value,
  options,
  getLabel,
  image,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: T[];
  getLabel: (item: T) => string;
  image?: (item: T) => string | null;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.id === value);
  return (
    <Field label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? getLabel(selected) : placeholder}
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>No se encontraron resultados.</CommandEmpty>
              <CommandGroup>
                {options.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${getLabel(item)} ${item.id}`}
                    onSelect={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    {image?.(item) ? (
                      <img src={image(item)!} alt="" className="size-5 object-contain" />
                    ) : (
                      <span className="grid size-5 place-items-center rounded-full bg-secondary text-[9px] font-bold">
                        {getLabel(item).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="flex-1">{getLabel(item)}</span>
                    <Check
                      className={cn(
                        "size-4",
                        value === item.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function BetPrediction({
  title,
  market,
  selection,
  risk,
  confidence,
  odds,
  result,
  definitionDisabled,
  resultDisabled,
  onMarket,
  onSelection,
  onRisk,
  onConfidence,
  onOdds,
  onResult,
}: {
  title: string;
  market: PickType;
  selection: string;
  risk: RiskLevel;
  confidence: string;
  odds: string;
  result: PickStatus;
  definitionDisabled: boolean;
  resultDisabled: boolean;
  onMarket: (value: PickType) => void;
  onSelection: (value: string) => void;
  onRisk: (value: RiskLevel) => void;
  onConfidence: (value: string) => void;
  onOdds: (value: string) => void;
  onResult: (value: PickStatus) => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
      <p className="font-display font-bold">{title}</p>
      <div className="mt-4 space-y-3">
        <Field label="Mercado">
          <Select
            value={market}
            disabled={definitionDisabled}
            onValueChange={(value) => onMarket(value as PickType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKET_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Selección">
          <Input
            disabled={definitionDisabled}
            value={selection}
            onChange={(event) => onSelection(event.target.value)}
            placeholder="Ej. Manchester City gana"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Riesgo">
            <Select
              value={risk}
              disabled={definitionDisabled}
              onValueChange={(value) => onRisk(value as RiskLevel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Confianza %">
            <Input
              type="number"
              min={0}
              max={100}
              disabled={definitionDisabled}
              value={confidence}
              onChange={(event) => onConfidence(event.target.value)}
            />
          </Field>
          <Field label="Cuota">
            <Input
              type="number"
              min={1.01}
              step="0.01"
              disabled={definitionDisabled}
              value={odds}
              onChange={(event) => onOdds(event.target.value)}
            />
          </Field>
          <Field label="Resultado">
            <Select
              value={result}
              disabled={resultDisabled}
              onValueChange={(value) => onResult(value as PickStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function ScorePrediction({
  title,
  home,
  away,
  confidence,
  result,
  definitionDisabled,
  onHome,
  onAway,
  onConfidence,
}: {
  title: string;
  home: string;
  away: string;
  confidence: string;
  result: PickStatus;
  definitionDisabled: boolean;
  onHome: (value: string) => void;
  onAway: (value: string) => void;
  onConfidence: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-bold">{title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Proyección analítica · sin riesgo · sin cuota
          </p>
        </div>
        <Select value={result} disabled>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Field label="Local">
          <Input
            type="number"
            min={0}
            disabled={definitionDisabled}
            value={home}
            onChange={(event) => onHome(event.target.value)}
          />
        </Field>
        <span className="pb-2 font-display text-xl font-bold">-</span>
        <Field label="Visitante">
          <Input
            type="number"
            min={0}
            disabled={definitionDisabled}
            value={away}
            onChange={(event) => onAway(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Confianza del modelo %">
          <Input
            type="number"
            min={0}
            max={100}
            disabled={definitionDisabled}
            value={confidence}
            onChange={(event) => onConfidence(event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function TeamPreview({ team, fallback }: { team: Team | null; fallback: string }) {
  const name = team?.name ?? fallback;
  return (
    <div className="min-w-0 flex-1 text-center">
      <div className="mx-auto grid size-14 place-items-center overflow-hidden rounded-full border border-border bg-background">
        {team?.logo_url ? (
          <img src={team.logo_url} alt="" className="size-10 object-contain" />
        ) : (
          <span className="font-display text-sm font-bold text-muted-foreground">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{name}</p>
    </div>
  );
}
