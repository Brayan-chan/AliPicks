import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { AdminPickForm } from "@/components/site/AdminPickForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccount, usePicks, usePlans, useSession } from "@/hooks/use-alipicks";
import {
  formatEventDate,
  money,
  SPORT_LABEL,
  STATUS_LABEL,
  winRate,
  type Pick,
  type PremiumContent,
} from "@/lib/alipicks";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Panel de administración — AliPicks" },
      { name: "description", content: "Publica picks, gestiona planes, usuarios y métricas de AliPicks." },
      { property: "og:title", content: "Panel de administración — AliPicks" },
      { property: "og:description", content: "Gestión de picks, planes, usuarios e ingresos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useSession();
  const { data: account, isLoading } = useMyAccount(user?.id);

  if (isLoading) {
    return (
      <Layout>
        <div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando…</div>
      </Layout>
    );
  }

  if (!account?.isAdmin) {
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
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Panel de administración</h1>
        <Tabs defaultValue="metrics" className="mt-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="picks">Picks</TabsTrigger>
            <TabsTrigger value="plans">Planes</TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
          </TabsList>
          <TabsContent value="metrics"><MetricsTab /></TabsContent>
          <TabsContent value="picks"><PicksTab /></TabsContent>
          <TabsContent value="plans"><PlansTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
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
  const { data: picks } = usePicks();
  const wr = winRate(picks ?? []);
  const activeSubs = (data?.subs ?? []).filter((s) => s.status === "active");
  const mrr = activeSubs.reduce((sum, s) => sum + (s.plans?.price_cents ?? 0), 0);
  const paid = (data?.purchases ?? []).filter((p) => p.status === "paid");
  const oneOff = paid.reduce((sum, p) => sum + p.amount_cents, 0);

  const stats = [
    { label: "Ingreso recurrente (MRR)", value: money(mrr) },
    { label: "Ventas de picks", value: money(oneOff) },
    { label: "Suscriptores activos", value: String(activeSubs.length) },
    { label: "Usuarios registrados", value: String(data?.profiles.length ?? 0) },
    { label: "Picks publicados", value: String((picks ?? []).filter((p) => p.is_published).length) },
    { label: "Efectividad global", value: `${wr.rate}% (${wr.won}-${wr.lost})` },
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
  const { data: picks } = usePicks();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ pick: Pick; premium: PremiumContent | null } | null>(null);
  const [query, setQuery] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["picks"] });
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };

  async function edit(pick: Pick) {
    const { data } = await supabase
      .from("pick_premium")
      .select("*")
      .eq("pick_id", pick.id)
      .maybeSingle();
    setEditing({ pick, premium: data ?? null });
  }

  async function setStatus(pick: Pick, status: string) {
    const { error } = await supabase
      .from("picks")
      .update({ status: status as Pick["status"] })
      .eq("id", pick.id);
    if (error) {
      toast.error("No se pudo actualizar el resultado.");
      return;
    }
    toast.success("Resultado actualizado");
    refresh();
  }

  async function remove(pick: Pick) {
    const { error } = await supabase.from("picks").delete().eq("id", pick.id);
    if (error) {
      toast.error("No se pudo eliminar el pick.");
      return;
    }
    toast.success("Pick eliminado");
    refresh();
  }

  const filtered = (picks ?? []).filter((p) =>
    (p.teams + p.league + p.selection).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar pick…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand text-primary-foreground">
              <Plus className="size-4" /> Nuevo pick
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Publicar pick</DialogTitle>
            </DialogHeader>
            <AdminPickForm
              onSaved={() => {
                setOpen(false);
                refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.teams}</p>
              <p className="text-xs text-muted-foreground">
                {SPORT_LABEL[p.sport]} · {p.league} · {formatEventDate(p.event_at)} · {p.selection}
              </p>
            </div>
            <Badge variant={p.visibility === "free" ? "secondary" : "default"}>
              {p.visibility === "free" ? "Gratis" : money(p.price_cents)}
            </Badge>
            {!p.is_published && <Badge variant="outline">Borrador</Badge>}
            <Select value={p.status} onValueChange={(v) => setStatus(p, v)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="secondary" onClick={() => edit(p)}>
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(p)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar pick</DialogTitle>
          </DialogHeader>
          {editing && (
            <AdminPickForm
              pick={editing.pick}
              premium={editing.premium}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
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
        const sub = (data?.subs ?? []).find((s) => s.user_id === profile.id && s.status === "active");
        const spent = (data?.purchases ?? [])
          .filter((p) => p.user_id === profile.id && p.status === "paid")
          .reduce((sum, p) => sum + p.amount_cents, 0);
        return (
          <div
            key={profile.id}
            className="surface-card flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {profile.full_name || "Sin nombre"}
              </p>
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
