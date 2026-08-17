import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLeagues, useMyAccount, useSession } from "@/hooks/use-alipicks";
import { SPORT_LABEL, type Sport } from "@/lib/alipicks";
import type { League } from "@/lib/sports-domain";

export const Route = createFileRoute("/_authenticated/admin/leagues")({
  head: () => ({
    meta: [{ title: "Ligas — AliPicks Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLeaguesPage,
});
type Draft = {
  name: string;
  slug: string;
  sport: Sport;
  country: string;
  logo_url: string;
  is_active: boolean;
};
const emptyDraft = (): Draft => ({
  name: "",
  slug: "",
  sport: "soccer",
  country: "",
  logo_url: "",
  is_active: true,
});
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
function AdminLeaguesPage() {
  const { user } = useSession();
  const { data: account, isLoading } = useMyAccount(user?.id);
  if (isLoading)
    return (
      <Layout>
        <div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando…</div>
      </Layout>
    );
  if (!account?.isAdmin)
    return (
      <Layout>
        <div className="px-4 py-20 text-center">Acceso restringido.</div>
      </Layout>
    );
  return (
    <Layout>
      <LeaguesManager />
    </Layout>
  );
}
function LeaguesManager() {
  const queryClient = useQueryClient();
  const [sport, setSport] = useState<Sport | "all">("all");
  const { data: leagues = [] } = useLeagues(sport === "all" ? undefined : sport);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<League | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(
    () =>
      leagues.filter((league) =>
        `${league.name} ${league.country ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [leagues, query],
  );
  function openNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setCreating(true);
  }
  function openEdit(league: League) {
    setEditing(league);
    setDraft({
      name: league.name,
      slug: league.slug,
      sport: league.sport,
      country: league.country ?? "",
      logo_url: league.logo_url ?? "",
      is_active: league.is_active,
    });
    setCreating(true);
  }
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["leagues"] });
  }
  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo debe pesar menos de 2 MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `leagues/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("sports-assets")
      .upload(path, file, { upsert: false });
    if (error) {
      toast.error("No se pudo subir el logo.");
      return;
    }
    const { data } = supabase.storage.from("sports-assets").getPublicUrl(path);
    setDraft((current) => ({ ...current, logo_url: data.publicUrl }));
  }
  async function save() {
    if (!draft.name.trim()) {
      toast.error("Escribe el nombre de la liga.");
      return;
    }
    const slug = draft.slug.trim() || slugify(draft.name);
    if (!slug) {
      toast.error("El slug no es válido.");
      return;
    }
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      slug,
      sport: draft.sport,
      country: draft.country.trim() || null,
      logo_url: draft.logo_url.trim() || null,
      is_active: draft.is_active,
    };
    const result = editing
      ? await supabase.from("leagues").update(payload).eq("id", editing.id)
      : await supabase.from("leagues").insert(payload);
    setBusy(false);
    if (result.error) {
      toast.error(
        result.error.code === "23505"
          ? "Ya existe una liga con ese slug."
          : "No se pudo guardar la liga.",
      );
      return;
    }
    toast.success(editing ? "Liga actualizada" : "Liga creada");
    setCreating(false);
    await refresh();
  }
  async function remove(league: League) {
    if (
      !window.confirm(`¿Eliminar ${league.name}? Solo será posible si no tiene picks relacionados.`)
    )
      return;
    const { error } = await supabase.from("leagues").delete().eq("id", league.id);
    if (error) {
      toast.error("No se puede eliminar la liga mientras tenga relaciones activas.");
      return;
    }
    toast.success("Liga eliminada");
    await refresh();
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2">
            <Link to="/admin">
              <ArrowLeft className="size-4" /> Volver al admin
            </Link>
          </Button>
          <h1 className="font-display text-3xl font-extrabold">Ligas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catálogo central de competiciones usado por el Pick Editor.
          </p>
        </div>
        <Button onClick={openNew} className="bg-gradient-brand text-primary-foreground">
          <Plus className="size-4" /> Nueva liga
        </Button>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          placeholder="Buscar liga o país…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={sport} onValueChange={(v) => setSport(v as Sport | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los deportes</SelectItem>
            {Object.entries(SPORT_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {filtered.map((league) => (
          <div
            key={league.id}
            className="surface-card flex items-center gap-4 rounded-2xl border border-border/70 p-4"
          >
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
              {league.logo_url ? (
                <img src={league.logo_url} alt="" className="size-11 object-contain" />
              ) : (
                <span className="font-display text-sm font-bold text-muted-foreground">
                  {league.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{league.name}</p>
              <p className="text-xs text-muted-foreground">
                {SPORT_LABEL[league.sport]} · {league.country || "Sin país"} ·{" "}
                {league.is_active ? "Activa" : "Inactiva"}
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">/{league.slug}</p>
            </div>
            <Button size="icon" variant="secondary" onClick={() => openEdit(league)}>
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(league)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <div className="mt-10 text-center text-sm text-muted-foreground">
          No hay ligas que coincidan con la búsqueda.
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar liga" : "Nueva liga"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Nombre">
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value,
                    slug: editing ? d.slug : slugify(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Slug">
              <Input
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deporte">
                <Select
                  value={draft.sport}
                  onValueChange={(v) => setDraft((d) => ({ ...d, sport: v as Sport }))}
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
              <Field label="País">
                <Input
                  value={draft.country}
                  onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Logo">
              <div className="flex gap-3">
                <Input
                  value={draft.logo_url}
                  onChange={(e) => setDraft((d) => ({ ...d, logo_url: e.target.value }))}
                  placeholder="URL o sube un archivo"
                />
                <Button variant="secondary" asChild>
                  <label className="cursor-pointer">
                    <Upload className="size-4" /> Subir
                    <input
                      className="hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                    />
                  </label>
                </Button>
              </div>
            </Field>
            {draft.logo_url && (
              <img
                src={draft.logo_url}
                alt="Preview"
                className="size-16 rounded-xl border object-contain p-1"
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              />{" "}
              Liga activa
            </label>
            <Button className="w-full" disabled={busy} onClick={save}>
              {busy ? "Guardando…" : "Guardar liga"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
