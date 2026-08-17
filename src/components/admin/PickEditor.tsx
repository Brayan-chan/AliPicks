import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { EVENT_STATE_LABEL, PICK_TYPE_LABEL, RISK_LABEL, SPORT_LABEL, STATUS_LABEL, parseFactors, type Factor, type PickStatus, type PickType, type RiskLevel, type Sport } from "@/lib/alipicks";
import { getPrimaryPrediction, getScorePrediction, getSecondaryPrediction, type League, type StructuredPick, type Team } from "@/lib/sports-domain";
import { useLeagueTeams, useLeagues } from "@/hooks/use-alipicks";
import { cn } from "@/lib/utils";

const sportsDb = supabase as any;

const DEFAULT_FACTORS: Factor[] = [
  { title: "Lo que está en juego", color: "#d8b45a", text: "" },
  { title: "Fuerza del equipo", color: "#4ea88a", text: "" },
  { title: "Lesiones y bajas", color: "#d96a5a", text: "" },
  { title: "Choque de estilos", color: "#6c9ad2", text: "" },
  { title: "Cuotas y líneas", color: "#b98cd6", text: "" },
  { title: "Forma local / visitante", color: "#e0995a", text: "" },
];

const MARKET_OPTIONS = Object.entries(PICK_TYPE_LABEL).filter(([key]) => key !== "marcador_exacto") as [PickType, string][];

type Draft = {
  sport: Sport;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  eventAt: string;
  eventState: string;
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
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyDraft(): Draft {
  return {
    sport: "soccer",
    leagueId: "",
    homeTeamId: "",
    awayTeamId: "",
    eventAt: toLocalInput(new Date(Date.now() + 86400000).toISOString()),
    eventState: "upcoming",
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
  const score = getScorePrediction(pick, "primary_score");
  const alt = getScorePrediction(pick, "alt_score");
  const factors = parseFactors(pick.factors);
  return {
    ...emptyDraft(),
    sport: pick.sport,
    leagueId: pick.league_id ?? pick.league_ref?.id ?? "",
    homeTeamId: pick.home_team_id ?? pick.home_team_ref?.id ?? "",
    awayTeamId: pick.away_team_id ?? pick.away_team_ref?.id ?? "",
    eventAt: toLocalInput(pick.event_at),
    eventState: pick.event_state,
    homeScore: pick.home_score?.toString() ?? "",
    awayScore: pick.away_score?.toString() ?? "",
    probHome: pick.prob_home?.toString() ?? "",
    probDraw: pick.prob_draw?.toString() ?? "",
    probAway: pick.prob_away?.toString() ?? "",
    analysis: pick.basic_analysis ?? pick.short_description ?? "",
    primaryMarket: primary.market_type ?? "1x2",
    primarySelection: primary.selection ?? "",
    primaryRisk: primary.risk ?? "bajo",
    primaryConfidence: String(primary.confidence || 70),
    primaryOdds: primary.odds?.toString() ?? "",
    primaryResult: primary.result,
    secondaryMarket: secondary?.market_type ?? "over_under",
    secondarySelection: secondary?.selection ?? "",
    secondaryRisk: secondary?.risk ?? "medio",
    secondaryConfidence: String(secondary?.confidence || 60),
    secondaryOdds: secondary?.odds?.toString() ?? "",
    secondaryResult: secondary?.result ?? "pending",
    primaryScoreHome: score?.predicted_home_score?.toString() ?? "",
    primaryScoreAway: score?.predicted_away_score?.toString() ?? "",
    primaryScoreConfidence: String(score?.confidence || 30),
    primaryScoreResult: score?.result ?? "pending",
    altScoreHome: alt?.predicted_home_score?.toString() ?? "",
    altScoreAway: alt?.predicted_away_score?.toString() ?? "",
    altScoreConfidence: String(alt?.confidence || 20),
    altScoreResult: alt?.result ?? "pending",
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
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function positiveInt(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value);
}

export function PickEditor({ pick }: { pick?: StructuredPick }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => pick ? draftFromPick(pick) : emptyDraft());
  const [busy, setBusy] = useState(false);
  const { data: leagues = [] } = useLeagues(draft.sport);
  const { data: teams = [] } = useLeagueTeams(draft.leagueId || undefined);
  const selectedLeague = leagues.find((league) => league.id === draft.leagueId) ?? pick?.league_ref ?? null;
  const selectedHome = teams.find((team) => team.id === draft.homeTeamId) ?? pick?.home_team_ref ?? null;
  const selectedAway = teams.find((team) => team.id === draft.awayTeamId) ?? pick?.away_team_ref ?? null;

  const probabilityTotal = useMemo(() => {
    const home = Number(draft.probHome || 0);
    const draw = Number(draft.probDraw || 0);
    const away = Number(draft.probAway || 0);
    return home + draw + away;
  }, [draft.probHome, draft.probDraw, draft.probAway]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function changeSport(sport: Sport) {
    setDraft((current) => ({ ...current, sport, leagueId: "", homeTeamId: "", awayTeamId: "", probDraw: sport === "mlb" ? "" : current.probDraw }));
  }

  function changeLeague(leagueId: string) {
    setDraft((current) => ({ ...current, leagueId, homeTeamId: "", awayTeamId: "" }));
  }

  function validationError() {
    if (!draft.leagueId || !draft.homeTeamId || !draft.awayTeamId) return "Selecciona liga, equipo local y equipo visitante.";
    if (draft.homeTeamId === draft.awayTeamId) return "El equipo local y visitante deben ser distintos.";
    if (!draft.eventAt) return "Selecciona fecha y hora del partido.";
    if (!draft.analysis.trim()) return "Escribe el análisis del partido.";
    if (!draft.primarySelection.trim() || !draft.secondarySelection.trim()) return "Primary Pick y Secondary Pick son obligatorios.";
    if (Number(draft.primaryOdds) <= 1 || Number(draft.secondaryOdds) <= 1) return "Las cuotas de Primary y Secondary deben ser mayores a 1.00.";
    if (asPercent(draft.primaryConfidence) == null || asPercent(draft.secondaryConfidence) == null) return "Las confianzas de Primary y Secondary deben estar entre 0 y 100.";
    if (positiveInt(draft.primaryScoreHome) == null || positiveInt(draft.primaryScoreAway) == null || positiveInt(draft.altScoreHome) == null || positiveInt(draft.altScoreAway) == null) return "Primary Score y Alt Score deben tener marcadores válidos.";
    if (asPercent(draft.primaryScoreConfidence) == null || asPercent(draft.altScoreConfidence) == null) return "Las confianzas de los marcadores deben estar entre 0 y 100.";
    const home = asPercent(draft.probHome);
    const away = asPercent(draft.probAway);
    const draw = draft.sport === "soccer" ? asPercent(draft.probDraw) : draft.probDraw.trim() ? asPercent(draft.probDraw) : null;
    if (home == null || away == null || (draft.sport === "soccer" && draw == null)) return "Completa correctamente las probabilidades del partido.";
    if (Math.abs(probabilityTotal - 100) > 0.001) return "Las probabilidades deben sumar exactamente 100%.";
    if (draft.factors.some((factor) => !factor.text.trim())) return "Completa los seis factores del análisis.";
    const hasRealScore = draft.homeScore.trim() || draft.awayScore.trim();
    if (hasRealScore && (positiveInt(draft.homeScore) == null || positiveInt(draft.awayScore) == null)) return "Si registras un resultado real, completa ambos marcadores.";
    return null;
  }

  async function save() {
    const invalid = validationError();
    if (invalid) { toast.error(invalid); return; }
    if (!selectedLeague || !selectedHome || !selectedAway) { toast.error("No se pudieron resolver las entidades seleccionadas."); return; }

    setBusy(true);
    try {
      const analysis = draft.analysis.trim();
      const shortDescription = analysis.length > 280 ? `${analysis.slice(0, 277)}...` : analysis;
      const realScore = draft.homeScore.trim() && draft.awayScore.trim();
      const tags = draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const primaryConfidence = Number(draft.primaryConfidence);
      const primaryOdds = Number(draft.primaryOdds);

      const payload = {
        sport: draft.sport,
        league_id: draft.leagueId,
        home_team_id: draft.homeTeamId,
        away_team_id: draft.awayTeamId,
        home_score: realScore ? Number(draft.homeScore) : null,
        away_score: realScore ? Number(draft.awayScore) : null,
        event_at: new Date(draft.eventAt).toISOString(),
        event_state: draft.eventState,
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
        published_at: draft.isPublished ? (pick?.published_at ?? new Date().toISOString()) : null,
        final_result: realScore ? `${draft.homeScore}-${draft.awayScore}` : null,
        // Legacy mirrors kept until Step 8.
        league: selectedLeague.name,
        teams: `${selectedHome.name} vs ${selectedAway.name}`,
        pick_type: draft.primaryMarket,
        selection: draft.primarySelection.trim(),
        risk: draft.primaryRisk,
        confidence: primaryConfidence,
        odds: primaryOdds,
        status: draft.primaryResult,
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

      let pickId = pick?.id;
      if (pickId) {
        const { error } = await sportsDb.from("picks").update(payload).eq("id", pickId);
        if (error) throw error;
      } else {
        const { data, error } = await sportsDb.from("picks").insert(payload).select("id").single();
        if (error || !data) throw error ?? new Error("No se pudo crear el pick");
        pickId = data.id;
      }

      const predictions = [
        { pick_id: pickId, kind: "primary", market_type: draft.primaryMarket, selection: draft.primarySelection.trim(), line: null, predicted_home_score: null, predicted_away_score: null, confidence: Number(draft.primaryConfidence), risk: draft.primaryRisk, odds: Number(draft.primaryOdds), result: draft.primaryResult },
        { pick_id: pickId, kind: "secondary", market_type: draft.secondaryMarket, selection: draft.secondarySelection.trim(), line: null, predicted_home_score: null, predicted_away_score: null, confidence: Number(draft.secondaryConfidence), risk: draft.secondaryRisk, odds: Number(draft.secondaryOdds), result: draft.secondaryResult },
        { pick_id: pickId, kind: "primary_score", market_type: null, selection: null, line: null, predicted_home_score: Number(draft.primaryScoreHome), predicted_away_score: Number(draft.primaryScoreAway), confidence: Number(draft.primaryScoreConfidence), risk: null, odds: null, result: draft.primaryScoreResult },
        { pick_id: pickId, kind: "alt_score", market_type: null, selection: null, line: null, predicted_home_score: Number(draft.altScoreHome), predicted_away_score: Number(draft.altScoreAway), confidence: Number(draft.altScoreConfidence), risk: null, odds: null, result: draft.altScoreResult },
      ];
      const { error: predictionsError } = await sportsDb.from("pick_predictions").upsert(predictions, { onConflict: "pick_id,kind" });
      if (predictionsError) throw predictionsError;

      toast.success(pick ? "Pick actualizado" : "Pick creado correctamente");
      navigate({ to: "/admin" });
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el pick. Revisa las migraciones y los datos ingresados.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-6">
      <EditorSection title="1. Partido" description="Selecciona liga y equipos registrados. Cambiar una selección no borra el resto del formulario.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Deporte"><Select value={draft.sport} onValueChange={(value) => changeSport(value as Sport)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SPORT_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <EntityPicker label="Liga" placeholder="Buscar liga…" value={draft.leagueId} options={leagues} getLabel={(league) => league.name} onChange={changeLeague} />
          <EntityPicker label="Equipo local" placeholder="Buscar equipo local…" value={draft.homeTeamId} options={teams.filter((team) => team.id !== draft.awayTeamId)} getLabel={(team) => team.name} image={(team) => team.logo_url} onChange={(value) => set("homeTeamId", value)} disabled={!draft.leagueId} />
          <EntityPicker label="Equipo visitante" placeholder="Buscar equipo visitante…" value={draft.awayTeamId} options={teams.filter((team) => team.id !== draft.homeTeamId)} getLabel={(team) => team.name} image={(team) => team.logo_url} onChange={(value) => set("awayTeamId", value)} disabled={!draft.leagueId} />
          <Field label="Fecha y hora"><Input type="datetime-local" value={draft.eventAt} onChange={(event) => set("eventAt", event.target.value)} /></Field>
          <Field label="Estado del partido"><Select value={draft.eventState} onValueChange={(value) => set("eventState", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(EVENT_STATE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Marcador real local" hint="Déjalo vacío antes del partido."><Input type="number" min={0} value={draft.homeScore} onChange={(event) => set("homeScore", event.target.value)} /></Field><Field label="Marcador real visitante"><Input type="number" min={0} value={draft.awayScore} onChange={(event) => set("awayScore", event.target.value)} /></Field></div>
      </EditorSection>

      <EditorSection title="2. Probabilidades del modelo" description="La suma debe ser exactamente 100%.">
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Local %"><Input type="number" min={0} max={100} value={draft.probHome} onChange={(event) => set("probHome", event.target.value)} /></Field>{draft.sport === "soccer" && <Field label="Empate %"><Input type="number" min={0} max={100} value={draft.probDraw} onChange={(event) => set("probDraw", event.target.value)} /></Field>}<Field label="Visitante %"><Input type="number" min={0} max={100} value={draft.probAway} onChange={(event) => set("probAway", event.target.value)} /></Field></div>
        <p className={cn("mt-3 text-xs font-semibold", probabilityTotal === 100 ? "text-success" : "text-destructive")}>Total: {probabilityTotal}%</p>
      </EditorSection>

      <EditorSection title="3. Predicciones" description="Todos los eventos tienen cuatro salidas del modelo. Los marcadores exactos no tienen riesgo ni cuota.">
        <div className="grid gap-4 lg:grid-cols-2"><BetPrediction title="Primary Pick" market={draft.primaryMarket} selection={draft.primarySelection} risk={draft.primaryRisk} confidence={draft.primaryConfidence} odds={draft.primaryOdds} result={draft.primaryResult} onMarket={(v) => set("primaryMarket", v)} onSelection={(v) => set("primarySelection", v)} onRisk={(v) => set("primaryRisk", v)} onConfidence={(v) => set("primaryConfidence", v)} onOdds={(v) => set("primaryOdds", v)} onResult={(v) => set("primaryResult", v)} /><BetPrediction title="Secondary Pick" market={draft.secondaryMarket} selection={draft.secondarySelection} risk={draft.secondaryRisk} confidence={draft.secondaryConfidence} odds={draft.secondaryOdds} result={draft.secondaryResult} onMarket={(v) => set("secondaryMarket", v)} onSelection={(v) => set("secondarySelection", v)} onRisk={(v) => set("secondaryRisk", v)} onConfidence={(v) => set("secondaryConfidence", v)} onOdds={(v) => set("secondaryOdds", v)} onResult={(v) => set("secondaryResult", v)} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><ScorePrediction title="Primary Score" home={draft.primaryScoreHome} away={draft.primaryScoreAway} confidence={draft.primaryScoreConfidence} result={draft.primaryScoreResult} onHome={(v) => set("primaryScoreHome", v)} onAway={(v) => set("primaryScoreAway", v)} onConfidence={(v) => set("primaryScoreConfidence", v)} onResult={(v) => set("primaryScoreResult", v)} /><ScorePrediction title="Alt Score" home={draft.altScoreHome} away={draft.altScoreAway} confidence={draft.altScoreConfidence} result={draft.altScoreResult} onHome={(v) => set("altScoreHome", v)} onAway={(v) => set("altScoreAway", v)} onConfidence={(v) => set("altScoreConfidence", v)} onResult={(v) => set("altScoreResult", v)} /></div>
      </EditorSection>

      <EditorSection title="4. Análisis" description="Una sola explicación principal. La descripción corta pública se genera automáticamente desde este texto."><Textarea rows={8} value={draft.analysis} onChange={(event) => set("analysis", event.target.value)} placeholder="Explica por qué el modelo llega a estas proyecciones…" /></EditorSection>

      <EditorSection title="5. Seis factores" description="Completa los seis factores. Los colores son parte del sistema visual y ya no se editan manualmente."><div className="grid gap-4 md:grid-cols-2">{draft.factors.map((factor, index) => <div key={factor.title} className="rounded-xl border border-border/70 bg-secondary/20 p-4" style={{ borderLeft: `3px solid ${factor.color}` }}><Label className="text-sm font-semibold">{factor.title}</Label><Textarea className="mt-2" rows={4} value={factor.text} onChange={(event) => set("factors", draft.factors.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></div>)}</div></EditorSection>

      <EditorSection title="6. Publicación" description="Configura acceso y visibilidad sin mezclarlo con el contenido analítico."><div className="grid gap-4 md:grid-cols-2"><Field label="Acceso"><Select value={draft.visibility} onValueChange={(value) => set("visibility", value as Draft["visibility"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="free">Acceso libre</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select></Field><Field label="Plan mínimo"><Input type="number" min={0} max={3} disabled={draft.visibility === "free"} value={draft.visibility === "free" ? 0 : draft.minPlanTier} onChange={(event) => set("minPlanTier", Number(event.target.value))} /></Field><Field label="Precio individual (centavos MXN)"><Input type="number" min={0} value={draft.priceCents} onChange={(event) => set("priceCents", Number(event.target.value))} /></Field><Field label="Etiquetas"><Input value={draft.tags} onChange={(event) => set("tags", event.target.value)} placeholder="champions, value, goles" /></Field></div><div className="mt-4 flex flex-wrap gap-5"><CheckField label="Publicado" checked={draft.isPublished} onChange={(v) => set("isPublished", v)} /><CheckField label="Destacado" checked={draft.featured} onChange={(v) => set("featured", v)} /><CheckField label="Recomendado" checked={draft.recommended} onChange={(v) => set("recommended", v)} /></div></EditorSection>

      <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => navigate({ to: "/admin" })}>Cancelar</Button><Button onClick={save} disabled={busy} className="min-w-40 bg-gradient-brand text-primary-foreground"><Save className="size-4" /> {busy ? "Guardando…" : pick ? "Guardar cambios" : "Crear pick"}</Button></div>
    </div>

    <aside className="xl:sticky xl:top-6 xl:self-start"><div className="surface-card rounded-2xl border border-border/70 p-5"><p className="eyebrow">Preview del partido</p><div className="mt-5 flex items-center gap-3"><TeamPreview team={selectedHome} fallback="Local" /><div className="shrink-0 text-center"><p className="font-display text-2xl font-extrabold">{draft.homeScore || 0} - {draft.awayScore || 0}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{EVENT_STATE_LABEL[draft.eventState as keyof typeof EVENT_STATE_LABEL] ?? draft.eventState}</p></div><TeamPreview team={selectedAway} fallback="Visitante" /></div><div className="mt-5 rounded-xl bg-secondary/40 p-4"><p className="text-xs text-muted-foreground">{selectedLeague?.name ?? "Selecciona una liga"}</p><p className="mt-2 text-sm font-semibold">Primary Pick</p><p className="mt-1 text-sm text-muted-foreground">{draft.primarySelection || "Sin selección"}</p><p className="mt-3 text-sm font-semibold">Secondary Pick</p><p className="mt-1 text-sm text-muted-foreground">{draft.secondarySelection || "Sin selección"}</p></div><div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>Primary Score y Alt Score son proyecciones analíticas. No muestran cuota ni etiqueta de riesgo.</p></div></div></aside>
  </div>;
}

function EditorSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="surface-card rounded-2xl border border-border/70 p-5 sm:p-6"><div className="mb-5"><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{children}</section>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div>{hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}</div>; }
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} /> {label}</label>; }

function EntityPicker<T extends { id: string }>({ label, placeholder, value, options, getLabel, image, onChange, disabled }: { label: string; placeholder: string; value: string; options: T[]; getLabel: (item: T) => string; image?: (item: T) => string | null; onChange: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.id === value);
  return <Field label={label}><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">{selected ? getLabel(selected) : placeholder}<ChevronsUpDown className="size-4 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput placeholder={placeholder} /><CommandList><CommandEmpty>No se encontraron resultados.</CommandEmpty><CommandGroup>{options.map((item) => <CommandItem key={item.id} value={`${getLabel(item)} ${item.id}`} onSelect={() => { onChange(item.id); setOpen(false); }}>{image?.(item) ? <img src={image(item)!} alt="" className="size-5 object-contain" /> : <span className="grid size-5 place-items-center rounded-full bg-secondary text-[9px] font-bold">{getLabel(item).slice(0, 2).toUpperCase()}</span>}<span className="flex-1">{getLabel(item)}</span><Check className={cn("size-4", value === item.id ? "opacity-100" : "opacity-0")} /></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></Field>;
}

function BetPrediction({ title, market, selection, risk, confidence, odds, result, onMarket, onSelection, onRisk, onConfidence, onOdds, onResult }: { title: string; market: PickType; selection: string; risk: RiskLevel; confidence: string; odds: string; result: PickStatus; onMarket: (v: PickType) => void; onSelection: (v: string) => void; onRisk: (v: RiskLevel) => void; onConfidence: (v: string) => void; onOdds: (v: string) => void; onResult: (v: PickStatus) => void }) { return <div className="rounded-xl border border-border/70 bg-secondary/20 p-4"><p className="font-display font-bold">{title}</p><div className="mt-4 space-y-3"><Field label="Mercado"><Select value={market} onValueChange={(v) => onMarket(v as PickType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MARKET_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Selección"><Input value={selection} onChange={(e) => onSelection(e.target.value)} placeholder="Ej. Manchester City gana" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Riesgo"><Select value={risk} onValueChange={(v) => onRisk(v as RiskLevel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RISK_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Confianza %"><Input type="number" min={0} max={100} value={confidence} onChange={(e) => onConfidence(e.target.value)} /></Field><Field label="Cuota"><Input type="number" min={1.01} step="0.01" value={odds} onChange={(e) => onOdds(e.target.value)} /></Field><Field label="Resultado"><Select value={result} onValueChange={(v) => onResult(v as PickStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field></div></div></div>; }

function ScorePrediction({ title, home, away, confidence, result, onHome, onAway, onConfidence, onResult }: { title: string; home: string; away: string; confidence: string; result: PickStatus; onHome: (v: string) => void; onAway: (v: string) => void; onConfidence: (v: string) => void; onResult: (v: PickStatus) => void }) { return <div className="rounded-xl border border-border/70 bg-secondary/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-display font-bold">{title}</p><p className="mt-1 text-[11px] text-muted-foreground">Proyección analítica · sin riesgo · sin cuota</p></div><Select value={result} onValueChange={(v) => onResult(v as PickStatus)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><Field label="Local"><Input type="number" min={0} value={home} onChange={(e) => onHome(e.target.value)} /></Field><span className="pb-2 font-display text-xl font-bold">-</span><Field label="Visitante"><Input type="number" min={0} value={away} onChange={(e) => onAway(e.target.value)} /></Field></div><div className="mt-3"><Field label="Confianza del modelo %"><Input type="number" min={0} max={100} value={confidence} onChange={(e) => onConfidence(e.target.value)} /></Field></div></div>; }
function TeamPreview({ team, fallback }: { team: Team | null; fallback: string }) { const name = team?.name ?? fallback; return <div className="min-w-0 flex-1 text-center"><div className="mx-auto grid size-14 place-items-center overflow-hidden rounded-full border border-border bg-background">{team?.logo_url ? <img src={team.logo_url} alt="" className="size-10 object-contain" /> : <span className="font-display text-sm font-bold text-muted-foreground">{name.slice(0, 2).toUpperCase()}</span>}</div><p className="mt-2 truncate text-sm font-semibold">{name}</p></div>; }
