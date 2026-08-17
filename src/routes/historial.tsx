import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { StatusBadge } from "@/components/site/PickBits";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasPickAccess, useMyAccount, useSession, useStructuredPicks } from "@/hooks/use-alipicks";
import { formatEventDate, PICK_TYPE_LABEL, RISK_LABEL, SPORT_LABEL } from "@/lib/alipicks";
import { getLeagueName, getMatchTeams, getPrimaryPrediction, primaryWinRate, type StructuredPick } from "@/lib/sports-domain";

export const Route = createFileRoute("/historial")({
  head: () => ({ meta: [
    { title: "Historial de precisión — AliPicks" },
    { name: "description", content: "Consulta todas las predicciones principales finalizadas de AliPicks: precisión global, por deporte, por tipo de proyección y por variabilidad." },
    { property: "og:title", content: "Historial de precisión — AliPicks" },
    { property: "og:description", content: "Resultados verificables de nuestras predicciones principales de fútbol y MLB." },
  ] }),
  component: HistoryPage,
});

const ALL = "all";

function HistoryPage() {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: picks } = useStructuredPicks();
  const [sport, setSport] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [days, setDays] = useState("30");

  const resolved = useMemo(() => (picks ?? [])
    .filter((p) => { const result = getPrimaryPrediction(p).result; return result === "won" || result === "lost" || result === "void"; })
    .filter((p) => sport === ALL || p.sport === sport)
    .filter((p) => type === ALL || getPrimaryPrediction(p).market_type === type)
    .filter((p) => days === ALL || new Date(p.event_at).getTime() > Date.now() - Number(days) * 86400000)
    .sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime()), [picks, sport, type, days]);

  const global = primaryWinRate(resolved);
  const bySport = (["soccer", "mlb"] as const).map((s) => ({ label: SPORT_LABEL[s], ...primaryWinRate(resolved.filter((p) => p.sport === s)) }));
  const byType = Object.entries(PICK_TYPE_LABEL).map(([k, label]) => ({ label, ...primaryWinRate(resolved.filter((p) => getPrimaryPrediction(p).market_type === k)) }));
  const byRisk = Object.entries(RISK_LABEL).map(([k, label]) => ({ label, ...primaryWinRate(resolved.filter((p) => getPrimaryPrediction(p).risk === k)) }));

  return <Layout><div className="mx-auto max-w-6xl px-4 py-10">
    <h1 className="font-display text-3xl font-extrabold">Historial</h1>
    <p className="mt-1 text-sm text-muted-foreground">Resultados del pick principal de cada evento. Las predicciones secundarias y marcadores se miden por separado.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Filter label="Deporte" value={sport} onChange={setSport} options={[["soccer", "Fútbol"], ["mlb", "MLB"]]} />
      <Filter label="Tipo de pick" value={type} onChange={setType} options={Object.entries(PICK_TYPE_LABEL)} />
      <Filter label="Rango" value={days} onChange={setDays} allLabel="Todo el historial" options={[["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["90", "Últimos 90 días"]]} />
    </div>
    <div className="surface-card mt-6 rounded-2xl border border-border/70 p-6"><p className="text-sm text-muted-foreground">Precisión global · pick principal</p><p className="font-display text-5xl font-extrabold text-success">{global.rate}%</p><p className="text-sm text-muted-foreground">{global.won} acertadas · {global.lost} falladas · {global.total} predicciones resueltas</p></div>
    <div className="mt-6 grid gap-4 md:grid-cols-3"><StatBlock title="Por deporte" rows={bySport} /><StatBlock title="Por tipo de pick" rows={byType.filter((r) => r.total > 0)} /><StatBlock title="Por nivel de riesgo" rows={byRisk} /></div>
    <div className="mt-8 space-y-3">{resolved.map((p) => <HistoryRow key={p.id} pick={p} access={hasPickAccess(p, account)} />)}{resolved.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No hay predicciones principales finalizadas con esos filtros.</p>}</div>
    <div className="mt-8"><ResponsibleNotice /></div>
  </div></Layout>;
}

function HistoryRow({ pick, access }: { pick: StructuredPick; access: boolean }) {
  const primary = getPrimaryPrediction(pick);
  const teams = getMatchTeams(pick);
  return <div className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4"><div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{SPORT_LABEL[pick.sport]} · {getLeagueName(pick)} · {primary.market_type ? PICK_TYPE_LABEL[primary.market_type] : "Pick principal"}</p><p className="font-display font-bold">{teams.label}</p><p className="text-xs text-muted-foreground">{formatEventDate(pick.event_at)}</p></div><StatusBadge status={primary.result} />{access ? <Button asChild size="sm" variant="secondary"><Link to="/picks/$id" params={{ id: pick.id }}>Ver análisis</Link></Button> : <Button asChild size="sm" className="bg-gradient-brand text-primary-foreground"><Link to="/picks/$id" params={{ id: pick.id }}>Desbloquear análisis</Link></Button>}</div>;
}

function StatBlock({ title, rows }: { title: string; rows: { label: string; rate: number; total: number }[] }) { return <div className="surface-card rounded-2xl border border-border/70 p-5"><p className="font-display font-bold">{title}</p><div className="mt-3 space-y-3">{rows.map((r) => <div key={r.label}><div className="flex justify-between text-xs"><span className="text-muted-foreground">{r.label}</span><span className="font-semibold">{r.rate}% ({r.total})</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-gradient-brand" style={{ width: `${r.rate}%` }} /></div></div>)}</div></div>; }
function Filter({ label, value, onChange, options, allLabel = "Todos" }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; allLabel?: string }) { return <div><label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{allLabel}</SelectItem>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>; }
