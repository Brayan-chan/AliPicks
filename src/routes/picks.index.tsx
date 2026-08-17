import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Filter } from "lucide-react";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { PickCard } from "@/components/site/PickCard";
import { UnlockDialog } from "@/components/site/UnlockDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  hasPickAccess,
  planTier,
  useMyAccount,
  useSession,
  useStructuredPicks,
} from "@/hooks/use-alipicks";
import {
  EVENT_STATE_LABEL,
  PICK_TYPE_LABEL,
  RISK_LABEL,
  SPORT_LABEL,
  STATUS_LABEL,
} from "@/lib/alipicks";
import { getLeagueName, getPrimaryPrediction, type StructuredPick } from "@/lib/sports-domain";

export const Route = createFileRoute("/picks/")({
  head: () => ({
    meta: [
      { title: "Predicciones del día — AliPicks" },
      {
        name: "description",
        content:
          "Filtra predicciones deportivas por liga, mercado, riesgo y estado. Análisis gratuito y premium actualizado a diario.",
      },
      { property: "og:title", content: "Predicciones del día — AliPicks" },
      {
        property: "og:description",
        content: "Todas las predicciones deportivas con filtros por liga, mercado y riesgo.",
      },
    ],
  }),
  component: PicksPage,
});

const ALL = "all";

function PicksPage() {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: picks, isLoading } = useStructuredPicks();
  const [unlock, setUnlock] = useState<StructuredPick | null>(null);
  const [sport, setSport] = useState(ALL);
  const [league, setLeague] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [risk, setRisk] = useState(ALL);
  const [status, setStatus] = useState("pending");
  const [access, setAccess] = useState(ALL);
  const [state, setState] = useState(ALL);
  const [sort, setSort] = useState("date");
  const [showFilters, setShowFilters] = useState(false);
  const tier = planTier(account);

  const leagues = useMemo(
    () => Array.from(new Set((picks ?? []).map(getLeagueName))).sort(),
    [picks],
  );

  const typeRates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of Object.keys(PICK_TYPE_LABEL)) {
      const resolved = (picks ?? []).filter((p) => {
        const primary = getPrimaryPrediction(p);
        return primary.market_type === t && primary.result !== "pending";
      });
      const won = resolved.filter((p) => getPrimaryPrediction(p).result === "won").length;
      map[t] = resolved.length ? won / resolved.length : 0;
    }
    return map;
  }, [picks]);

  const filtered = useMemo(() => {
    let list = (picks ?? []).filter((p) => {
      const primary = getPrimaryPrediction(p);
      if (sport !== ALL && p.sport !== sport) return false;
      if (league !== ALL && getLeagueName(p) !== league) return false;
      if (type !== ALL && primary.market_type !== type) return false;
      if (risk !== ALL && primary.risk !== risk) return false;
      if (status !== ALL && primary.result !== status) return false;
      if (access !== ALL && p.visibility !== access) return false;
      if (state !== ALL && p.event_state !== state) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "winrate") {
        const aType = getPrimaryPrediction(a).market_type;
        const bType = getPrimaryPrediction(b).market_type;
        return (bType ? (typeRates[bType] ?? 0) : 0) - (aType ? (typeRates[aType] ?? 0) : 0);
      }
      return new Date(a.event_at).getTime() - new Date(b.event_at).getTime();
    });
    return list;
  }, [picks, sport, league, type, risk, status, access, state, sort, typeRates]);

  const grouped = useMemo(() => {
    const map = new Map<string, StructuredPick[]>();
    for (const p of filtered) {
      const key = `${SPORT_LABEL[p.sport]} · ${getLeagueName(p)}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Layout>
      <UnlockDialog
        pick={unlock}
        open={unlock !== null}
        onOpenChange={(v) => !v && setUnlock(null)}
      />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Predicciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Filtra y encuentra el partido que buscas. Las predicciones premium requieren un plan
          activo o desbloqueo individual.
        </p>

        <Button
          variant="secondary"
          className="mt-6 min-h-11 w-full justify-between sm:w-auto"
          onClick={() => setShowFilters((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Filter className="size-4" /> Filtros · {filtered.length} predicciones
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
          />
        </Button>

        <div
          className={`surface-card mt-3 gap-3 rounded-2xl border border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-4 ${showFilters ? "grid" : "hidden"}`}
        >
          <FilterSelect
            label="Deporte"
            value={sport}
            onChange={setSport}
            options={[
              ["soccer", "Soccer"],
              ["mlb", "MLB"],
            ]}
          />
          <FilterSelect
            label="Liga"
            value={league}
            onChange={setLeague}
            options={leagues.map((l) => [l, l])}
          />
          <FilterSelect
            label="Mercado principal"
            value={type}
            onChange={setType}
            options={Object.entries(PICK_TYPE_LABEL)}
          />
          <FilterSelect
            label="Estado del evento"
            value={state}
            onChange={setState}
            options={Object.entries(EVENT_STATE_LABEL)}
          />
          <FilterSelect
            label="Riesgo"
            value={risk}
            onChange={setRisk}
            options={Object.entries(RISK_LABEL)}
          />
          <FilterSelect
            label="Resultado Primary Pick"
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS_LABEL)}
          />
          <FilterSelect
            label="Acceso"
            value={access}
            onChange={setAccess}
            options={[
              ["free", "Gratuitas"],
              ["premium", "Premium"],
            ]}
          />
          <FilterSelect
            label="Ordenar por"
            value={sort}
            onChange={setSort}
            allLabel={null}
            options={[
              ["date", "Fecha (más próximos)"],
              ["winrate", "Precisión del mercado"],
            ]}
          />
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          grouped.map(([group, items]) => (
            <section key={group} className="mt-8">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-gradient-brand" />
                <h2 className="font-display text-lg font-bold">{group}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <PickCard
                    key={p.id}
                    pick={p}
                    hasAccess={hasPickAccess(p, account)}
                    onUnlock={setUnlock}
                    vip={tier >= 3}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No hay predicciones con esos filtros.
          </p>
        )}
        <div className="mt-8">
          <ResponsibleNotice />
        </div>
      </div>
    </Layout>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "Todos",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  allLabel?: string | null;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
