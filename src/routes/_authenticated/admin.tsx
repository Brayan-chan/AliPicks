import { useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccount, usePlans, useSession, useStructuredPicks } from "@/hooks/use-alipicks";
import { formatEventDate, money, SPORT_LABEL, STATUS_LABEL, type PickStatus } from "@/lib/alipicks";
import {
  getLeagueName,
  getMatchTeams,
  getPrimaryPrediction,
  primaryWinRate,
  type StructuredPick,
} from "@/lib/sports-domain";

const sportsDb = supabase;
export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Panel de administración — AliPicks" },
      {
        name: "description",
        content: "Publica picks, gestiona planes, usuarios y métricas de AliPicks.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useSession();
  const { data: account, isLoading } = useMyAccount(user?.id);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (isLoading)
    return (
      <Layout>
        <div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando…</div>
      </Layout>
    );
  if (!account?.isAdmin)
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta sección es solo para administradores de AliPicks.
          </p>
        </div>
      </Layout>
    );

  if (pathname !== "/admin") return <Outlet />;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold">Panel de administración</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestiona contenido, catálogo deportivo, usuarios e ingresos.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link to="/admin/leagues">Ligas</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/admin/teams">Equipos</Link>
            </Button>
          </div>
        </div>
        <Tabs defaultValue="metrics" className="mt-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="picks">Picks</TabsTrigger>
            <TabsTrigger value="plans">Planes</TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
          </TabsList>
          <TabsContent value="metrics">
            <MetricsTab />
          </TabsContent>
          <TabsContent value="picks">
            <PicksTab />
          </TabsContent>
          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
function useAdminData() {
  return useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [profiles, roles, subs, purchases] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
        supabase.from("subscriptions").select("*, plans(*)"),
        supabase.from("pick_purchases").select("*"),
      ]);
      return {
        profiles: profiles.data ?? [],
        roles: roles.data ?? [],
        subs: subs.data ?? [],
        purchases: purchases.data ?? [],
      };
    },
  });
}
function MetricsTab() {
  const { data } = useAdminData();
  const { data: picks } = useStructuredPicks();
  const wr = primaryWinRate(picks ?? []);
  const activeSubs = (data?.subs ?? []).filter((s) => s.status === "active");
  const mrr = activeSubs.reduce((sum, s) => sum + (s.plans?.price_cents ?? 0), 0);
  const paid = (data?.purchases ?? []).filter((p) => p.status === "paid");
  const oneOff = paid.reduce((sum, p) => sum + p.amount_cents, 0);
  const stats = [
    { label: "Ingreso recurrente (MRR)", value: money(mrr) },
    { label: "Ventas de picks", value: money(oneOff) },
    { label: "Suscriptores activos", value: String(activeSubs.length) },
    { label: "Usuarios registrados", value: String(data?.profiles.length ?? 0) },
    {
      label: "Picks publicados",
      value: String((picks ?? []).filter((p) => p.is_published).length),
    },
    { label: "Efectividad Primary Pick", value: `${wr.rate}% (${wr.won}-${wr.lost})` },
  ];
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="surface-card rounded-2xl border border-border/70 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
function PicksTab() {
  const { data: picks } = useStructuredPicks();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["picks"] });
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };
  async function setStatus(pick: StructuredPick, status: PickStatus) {
    const primary = getPrimaryPrediction(pick);
    const structuredPrimary = pick.predictions.find((prediction) => prediction.kind === "primary");
    if (structuredPrimary) {
      const { error } = await sportsDb
        .from("pick_predictions")
        .update({ result: status })
        .eq("id", structuredPrimary.id);
      if (error) {
        toast.error("No se pudo actualizar el resultado principal.");
        return;
      }
    }
    const { error: legacyError } = await sportsDb
      .from("picks")
      .update({ status })
      .eq("id", pick.id);
    if (legacyError) {
      toast.error("El resultado estructurado cambió, pero falló el espejo legacy.");
      return;
    }
    toast.success(`${primary.selection ?? "Primary Pick"}: ${STATUS_LABEL[status]}`);
    refresh();
  }
  async function remove(pick: StructuredPick) {
    const { error } = await sportsDb.from("picks").delete().eq("id", pick.id);
    if (error) {
      toast.error("No se pudo eliminar el pick.");
      return;
    }
    toast.success("Pick eliminado");
    refresh();
  }
  const filtered = (picks ?? []).filter((pick) => {
    const teams = getMatchTeams(pick).label;
    const primary = getPrimaryPrediction(pick).selection ?? "";
    return `${teams} ${getLeagueName(pick)} ${primary}`.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar partido, liga o pick…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button asChild className="bg-gradient-brand text-primary-foreground">
          <Link to="/admin/picks/new">
            <Plus className="size-4" /> Nuevo pick
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/leagues">Gestionar ligas</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/teams">Gestionar equipos</Link>
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {filtered.map((pick) => {
          const primary = getPrimaryPrediction(pick);
          const teams = getMatchTeams(pick);
          return (
            <div
              key={pick.id}
              className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{teams.label}</p>
                <p className="text-xs text-muted-foreground">
                  {SPORT_LABEL[pick.sport]} · {getLeagueName(pick)} ·{" "}
                  {formatEventDate(pick.event_at)} · {primary.selection}
                </p>
              </div>
              <Badge variant={pick.visibility === "free" ? "secondary" : "default"}>
                {pick.visibility === "free" ? "Gratis" : money(pick.price_cents)}
              </Badge>
              {!pick.is_published && <Badge variant="outline">Borrador</Badge>}
              <Select
                value={primary.result}
                onValueChange={(value) => setStatus(pick, value as PickStatus)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button asChild size="icon" variant="secondary">
                <Link to="/admin/picks/$id" params={{ id: pick.id }}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(pick)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function PlansTab() {
  const { data: plans } = usePlans();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  async function save(id: string, priceCents: number) {
    const { error } = await supabase.from("plans").update({ price_cents: priceCents }).eq("id", id);
    if (error) {
      toast.error("No se pudo actualizar el plan.");
      return;
    }
    toast.success("Plan actualizado");
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  }
  async function toggle(id: string, isActive: boolean) {
    await supabase.from("plans").update({ is_active: isActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  }
  return (
    <div className="mt-5 space-y-3">
      {(plans ?? []).map((plan) => (
        <div
          key={plan.id}
          className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold">{plan.name}</p>
            <p className="text-xs text-muted-foreground">{plan.description}</p>
          </div>
          <Input
            type="number"
            className="w-32"
            value={drafts[plan.id] ?? String(plan.price_cents)}
            onChange={(e) => setDrafts((d) => ({ ...d, [plan.id]: e.target.value }))}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => save(plan.id, Number(drafts[plan.id] ?? plan.price_cents))}
          >
            Guardar precio
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle(plan.id, !plan.is_active)}>
            {plan.is_active ? "Desactivar" : "Activar"}
          </Button>
        </div>
      ))}
    </div>
  );
}
function UsersTab() {
  const { data } = useAdminData();
  const queryClient = useQueryClient();
  async function toggleAdmin(userId: string, isAdmin: boolean) {
    const res = isAdmin
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin")
      : await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (res.error) {
      toast.error("No se pudo cambiar el rol.");
      return;
    }
    toast.success("Rol actualizado");
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  }
  return (
    <div className="mt-5 space-y-2">
      {(data?.profiles ?? []).map((profile) => {
        const isAdmin = (data?.roles ?? []).some(
          (r) => r.user_id === profile.id && r.role === "admin",
        );
        const sub = (data?.subs ?? []).find(
          (s) => s.user_id === profile.id && s.status === "active",
        );
        const spent = (data?.purchases ?? [])
          .filter((p) => p.user_id === profile.id && p.status === "paid")
          .reduce((sum, p) => sum + p.amount_cents, 0);
        return (
          <div
            key={profile.id}
            className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.full_name || "Sin nombre"}</p>
              <p className="text-xs text-muted-foreground">
                {sub?.plans?.name ?? "Sin plan"} · {money(spent)} en picks
              </p>
            </div>
            {isAdmin && <Badge>Admin</Badge>}
            <Button size="sm" variant="secondary" onClick={() => toggleAdmin(profile.id, isAdmin)}>
              {isAdmin ? "Quitar admin" : "Hacer admin"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
