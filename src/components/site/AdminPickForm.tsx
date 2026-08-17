import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  EVENT_STATE_LABEL,
  parseFactors,
  PICK_TYPE_LABEL,
  RISK_LABEL,
  SPORT_LABEL,
  STATUS_LABEL,
  TIER_LABEL,
  type Factor,
  type Pick,
  type PremiumContent,
} from "@/lib/alipicks";

type Draft = {
  sport: string;
  league: string;
  teams: string;
  event_at: string;
  pick_type: string;
  selection: string;
  risk: string;
  confidence: number;
  odds: string;
  prob_home: string;
  prob_draw: string;
  prob_away: string;
  short_description: string;
  basic_analysis: string;
  visibility: string;
  min_plan_tier: number;
  price_cents: number;
  status: string;
  featured: boolean;
  is_published: boolean;
  tags: string;
  advanced_analysis: string;
  key_factors: string;
  alternatives: string;
  recommended_odds: string;
  event_state: string;
  recommended: boolean;
  secondary_selection: string;
  secondary_pick_type: string;
  secondary_risk: string;
  secondary_confidence: string;
  secondary_odds: string;
  score_primary: string;
  score_primary_confidence: string;
  score_secondary: string;
  score_secondary_confidence: string;
  factors: Factor[];
  extra_tabs: string;
};

export const DEFAULT_FACTORS: Factor[] = [
  { title: "Lo que está en juego", color: "#d8b45a", text: "" },
  { title: "Fuerza del equipo", color: "#4ea88a", text: "" },
  { title: "Lesiones y bajas", color: "#d96a5a", text: "" },
  { title: "Choque de estilos", color: "#6c9ad2", text: "" },
  { title: "Cuotas y líneas", color: "#b98cd6", text: "" },
  { title: "Forma local / visitante", color: "#e0995a", text: "" },
];

function parseTabsInput(raw: string): Json {
  if (!raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Json) : [];
  } catch {
    return [];
  }
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyDraft(): Draft {
  return {
    sport: "soccer",
    league: "",
    teams: "",
    event_at: toLocalInput(new Date(Date.now() + 86400000).toISOString()),
    pick_type: "1x2",
    selection: "",
    risk: "medio",
    confidence: 70,
    odds: "",
    prob_home: "",
    prob_draw: "",
    prob_away: "",
    short_description: "",
    basic_analysis: "",
    visibility: "premium",
    min_plan_tier: 1,
    price_cents: 299,
    status: "pending",
    featured: false,
    is_published: true,
    tags: "",
    advanced_analysis: "",
    key_factors: "",
    alternatives: "",
    recommended_odds: "",
    event_state: "upcoming",
    recommended: false,
    secondary_selection: "",
    secondary_pick_type: "over_under",
    secondary_risk: "medio",
    secondary_confidence: "",
    secondary_odds: "",
    score_primary: "",
    score_primary_confidence: "",
    score_secondary: "",
    score_secondary_confidence: "",
    factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
    extra_tabs: "",
  };
}

function fromPick(pick: Pick, premium: PremiumContent | null): Draft {
  return {
    ...emptyDraft(),
    sport: pick.sport,
    league: pick.league,
    teams: pick.teams,
    event_at: toLocalInput(pick.event_at),
    pick_type: pick.pick_type,
    selection: pick.selection,
    risk: pick.risk,
    confidence: pick.confidence,
    odds: pick.odds?.toString() ?? "",
    prob_home: pick.prob_home?.toString() ?? "",
    prob_draw: pick.prob_draw?.toString() ?? "",
    prob_away: pick.prob_away?.toString() ?? "",
    short_description: pick.short_description,
    basic_analysis: pick.basic_analysis ?? "",
    visibility: pick.visibility,
    min_plan_tier: pick.min_plan_tier,
    price_cents: pick.price_cents,
    status: pick.status,
    featured: pick.featured,
    is_published: pick.is_published,
    tags: pick.tags.join(", "),
    advanced_analysis: premium?.advanced_analysis ?? "",
    key_factors: (premium?.key_factors ?? []).join("\n"),
    alternatives: premium?.alternatives ?? "",
    recommended_odds: premium?.recommended_odds ?? "",
    event_state: pick.event_state,
    recommended: pick.recommended,
    secondary_selection: pick.secondary_selection ?? "",
    secondary_pick_type: pick.secondary_pick_type ?? "over_under",
    secondary_risk: pick.secondary_risk ?? "medio",
    secondary_confidence: pick.secondary_confidence?.toString() ?? "",
    secondary_odds: pick.secondary_odds?.toString() ?? "",
    score_primary: pick.score_primary ?? "",
    score_primary_confidence: pick.score_primary_confidence?.toString() ?? "",
    score_secondary: pick.score_secondary ?? "",
    score_secondary_confidence: pick.score_secondary_confidence?.toString() ?? "",
    factors: (() => {
      const existing = parseFactors(pick.factors);
      return DEFAULT_FACTORS.map(
        (f, i) => existing[i] ?? { ...f },
      );
    })(),
    extra_tabs: Array.isArray(pick.extra_tabs) && pick.extra_tabs.length
      ? JSON.stringify(pick.extra_tabs, null, 2)
      : "",
  };
}

export function AdminPickForm({
  pick,
  premium,
  onSaved,
}: {
  pick?: Pick;
  premium?: PremiumContent | null;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(pick ? fromPick(pick, premium ?? null) : emptyDraft());
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    if (!d.teams.trim() || !d.league.trim() || !d.selection.trim() || !d.short_description.trim()) {
      toast.error("Completa equipos, liga, selección y descripción corta.");
      return;
    }
    setBusy(true);
    const payload = {
      sport: d.sport as Pick["sport"],
      league: d.league.trim().slice(0, 120),
      teams: d.teams.trim().slice(0, 160),
      event_at: new Date(d.event_at).toISOString(),
      pick_type: d.pick_type as Pick["pick_type"],
      selection: d.selection.trim().slice(0, 160),
      risk: d.risk as Pick["risk"],
      confidence: Math.min(100, Math.max(1, Number(d.confidence) || 1)),
      odds: num(d.odds),
      prob_home: num(d.prob_home),
      prob_draw: num(d.prob_draw),
      prob_away: num(d.prob_away),
      short_description: d.short_description.trim().slice(0, 400),
      basic_analysis: d.basic_analysis.trim() || null,
      visibility: d.visibility as Pick["visibility"],
      min_plan_tier: d.visibility === "free" ? 0 : Number(d.min_plan_tier),
      price_cents: Number(d.price_cents),
      status: d.status as Pick["status"],
      featured: d.featured,
      is_published: d.is_published,
      tags: d.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      event_state: d.event_state,
      recommended: d.recommended,
      secondary_selection: d.secondary_selection.trim() || null,
      secondary_pick_type: d.secondary_selection.trim()
        ? (d.secondary_pick_type as Pick["pick_type"])
        : null,
      secondary_risk: d.secondary_selection.trim() ? (d.secondary_risk as Pick["risk"]) : null,
      secondary_confidence: num(d.secondary_confidence),
      secondary_odds: num(d.secondary_odds),
      score_primary: d.score_primary.trim() || null,
      score_primary_confidence: num(d.score_primary_confidence),
      score_secondary: d.score_secondary.trim() || null,
      score_secondary_confidence: num(d.score_secondary_confidence),
      factors: d.factors.filter((f) => f.text.trim()) as unknown as Json,
      extra_tabs: parseTabsInput(d.extra_tabs),
    };

    let pickId = pick?.id;
    if (pick) {
      const { error } = await supabase.from("picks").update(payload).eq("id", pick.id);
      if (error) {
        setBusy(false);
        toast.error("No se pudo guardar la predicción.");
        return;
      }
    } else {
      const { data, error } = await supabase.from("picks").insert(payload).select("id").single();
      if (error || !data) {
        setBusy(false);
        toast.error("No se pudo crear la predicción.");
        return;
      }
      pickId = data.id;
    }

    if (d.visibility === "premium" && d.advanced_analysis.trim()) {
      const { error } = await supabase.from("pick_premium").upsert(
        {
          pick_id: pickId!,
          advanced_analysis: d.advanced_analysis.trim(),
          key_factors: d.key_factors
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
          alternatives: d.alternatives.trim() || null,
          recommended_odds: d.recommended_odds.trim() || null,
        },
        { onConflict: "pick_id" },
      );
      if (error) toast.error("La predicción se guardó, pero el contenido premium falló.");
    }

    setBusy(false);
    toast.success(pick ? "Predicción actualizada" : "Predicción publicada");
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick2 label="Deporte" value={d.sport} onChange={(v) => set("sport", v)} options={SPORT_LABEL} />
        <Text label="Liga" value={d.league} onChange={(v) => set("league", v)} />
        <Text label="Partido (Equipo A vs Equipo B)" value={d.teams} onChange={(v) => set("teams", v)} />
        <div>
          <Label className="text-xs text-muted-foreground">Fecha y hora del evento</Label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={d.event_at}
            onChange={(e) => set("event_at", e.target.value)}
          />
        </div>
        <Pick2
          label="Tipo de proyección"
          value={d.pick_type}
          onChange={(v) => set("pick_type", v)}
          options={PICK_TYPE_LABEL}
        />
        <Text label="Selección" value={d.selection} onChange={(v) => set("selection", v)} />
        <Pick2 label="Variabilidad" value={d.risk} onChange={(v) => set("risk", v)} options={RISK_LABEL} />
        <Text
          label="Confianza (%)"
          value={String(d.confidence)}
          onChange={(v) => set("confidence", Number(v) || 0)}
          type="number"
        />
        <Text label="Cuota" value={d.odds} onChange={(v) => set("odds", v)} type="number" />
        <Text label="Etiquetas (separadas por coma)" value={d.tags} onChange={(v) => set("tags", v)} />
        <Text label="Prob. local %" value={d.prob_home} onChange={(v) => set("prob_home", v)} type="number" />
        <Text label="Prob. empate %" value={d.prob_draw} onChange={(v) => set("prob_draw", v)} type="number" />
        <Text label="Prob. visita %" value={d.prob_away} onChange={(v) => set("prob_away", v)} type="number" />
        <Pick2 label="Resultado" value={d.status} onChange={(v) => set("status", v)} options={STATUS_LABEL} />
        <Pick2
          label="Estado del evento"
          value={d.event_state}
          onChange={(v) => set("event_state", v)}
          options={EVENT_STATE_LABEL}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/20 p-4">
        <p className="text-sm font-semibold">Proyección secundaria (opcional)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text
            label="Selección secundaria"
            value={d.secondary_selection}
            onChange={(v) => set("secondary_selection", v)}
          />
          <Pick2
            label="Tipo secundario"
            value={d.secondary_pick_type}
            onChange={(v) => set("secondary_pick_type", v)}
            options={PICK_TYPE_LABEL}
          />
          <Pick2
            label="Variabilidad secundaria"
            value={d.secondary_risk}
            onChange={(v) => set("secondary_risk", v)}
            options={RISK_LABEL}
          />
          <Text
            label="Confianza secundaria (%)"
            value={d.secondary_confidence}
            onChange={(v) => set("secondary_confidence", v)}
            type="number"
          />
          <Text
            label="Cuota secundaria"
            value={d.secondary_odds}
            onChange={(v) => set("secondary_odds", v)}
            type="number"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/20 p-4">
        <p className="text-sm font-semibold">Marcadores proyectados</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text
            label="Marcador principal (ej. 2-1)"
            value={d.score_primary}
            onChange={(v) => set("score_primary", v)}
          />
          <Text
            label="Confianza marcador principal (%)"
            value={d.score_primary_confidence}
            onChange={(v) => set("score_primary_confidence", v)}
            type="number"
          />
          <Text
            label="Marcador alternativo"
            value={d.score_secondary}
            onChange={(v) => set("score_secondary", v)}
          />
          <Text
            label="Confianza marcador alternativo (%)"
            value={d.score_secondary_confidence}
            onChange={(v) => set("score_secondary_confidence", v)}
            type="number"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/20 p-4">
        <p className="text-sm font-semibold">Análisis de seis factores</p>
        {d.factors.map((f, i) => (
          <div key={f.title} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div>
              <Label className="text-xs text-muted-foreground">{f.title}</Label>
              <Textarea
                className="mt-1 min-h-20"
                value={f.text}
                onChange={(e) => {
                  const next = d.factors.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  );
                  set("factors", next);
                }}
              />
            </div>
            <div className="flex items-end">
              <input
                type="color"
                aria-label={`Color de ${f.title}`}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                value={f.color}
                onChange={(e) => {
                  const next = d.factors.map((x, j) =>
                    j === i ? { ...x, color: e.target.value } : x,
                  );
                  set("factors", next);
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <Area
        label='Pestañas de datos (JSON: [{"label":"Cuotas","rows":[{"Casa":"1.90"}]}])'
        value={d.extra_tabs}
        onChange={(v) => set("extra_tabs", v)}
      />

      <Area
        label="Descripción corta (visible para todos)"
        value={d.short_description}
        onChange={(v) => set("short_description", v)}
      />
      <Area
        label="Análisis básico (visible para todos)"
        value={d.basic_analysis}
        onChange={(v) => set("basic_analysis", v)}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Pick2
          label="Visibilidad"
          value={d.visibility}
          onChange={(v) => set("visibility", v)}
          options={{ free: "Gratuita", premium: "Premium" }}
        />
        <Pick2
          label="Plan mínimo"
          value={String(d.min_plan_tier)}
          onChange={(v) => set("min_plan_tier", Number(v))}
          options={TIER_LABEL as unknown as Record<string, string>}
        />
        <Text
          label="Precio individual (centavos)"
          value={String(d.price_cents)}
          onChange={(v) => set("price_cents", Number(v) || 0)}
          type="number"
        />
      </div>

      {d.visibility === "premium" && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/30 p-4">
          <p className="text-sm font-semibold">Contenido exclusivo</p>
          <Area
            label="Análisis avanzado"
            value={d.advanced_analysis}
            onChange={(v) => set("advanced_analysis", v)}
          />
          <Area
            label="Factores clave (uno por línea)"
            value={d.key_factors}
            onChange={(v) => set("key_factors", v)}
          />
          <Text
            label="Alternativas"
            value={d.alternatives}
            onChange={(v) => set("alternatives", v)}
          />
          <Text
            label="Cuota recomendada mínima"
            value={d.recommended_odds}
            onChange={(v) => set("recommended_odds", v)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={d.featured} onCheckedChange={(v) => set("featured", v === true)} />
          Destacado
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={d.recommended}
            onCheckedChange={(v) => set("recommended", v === true)}
          />
          Recomendada VIP
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={d.is_published} onCheckedChange={(v) => set("is_published", v === true)} />
          Publicado
        </label>
      </div>

      <Button onClick={save} disabled={busy} className="w-full bg-gradient-brand text-primary-foreground">
        {pick ? "Guardar cambios" : "Publicar predicción"}
      </Button>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea className="mt-1 min-h-24" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Pick2({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
