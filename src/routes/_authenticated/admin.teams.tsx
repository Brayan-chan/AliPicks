import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAdminLeagues, useMyAccount, useSession } from "@/hooks/use-alipicks";
import { SPORT_LABEL, type Sport } from "@/lib/alipicks";
import type { Team } from "@/lib/sports-domain";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  head: () => ({ meta: [{ title: "Equipos — AliPicks Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminTeamsPage,
});

type TeamRow = Team & { league_ids: string[] };
type Draft = { name: string; short_name: string; slug: string; sport: Sport; country: string; logo_url: string; league_ids: string[]; is_active: boolean };
const emptyDraft = (): Draft => ({ name: "", short_name: "", slug: "", sport: "soccer", country: "", logo_url: "", league_ids: [], is_active: true });
const slugify = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function AdminTeamsPage() {
  const { user } = useSession();
  const { data: account, isLoading } = useMyAccount(user?.id);
  if (isLoading) return <Layout><div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando…</div></Layout>;
  if (!account?.isAdmin) return <Layout><div className="px-4 py-20 text-center">Acceso restringido.</div></Layout>;
  return <Layout><TeamsManager /></Layout>;
}

function TeamsManager() {
  const queryClient = useQueryClient();
  const [sport, setSport] = useState<Sport | "all">("all");
  const { data: teams = [] } = useQuery<TeamRow[]>({
    queryKey: ["admin-teams", sport],
    queryFn: async () => {
      let q = supabase.from("teams").select("*, league_teams(league_id,is_active)").order("name");
      if (sport !== "all") q = q.eq("sport", sport);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((team) => ({
        ...team,
        league_ids: (team.league_teams ?? []).filter((item) => item.is_active).map((item) => item.league_id),
      }));
    },
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => teams.filter((team) => `${team.name} ${team.short_name ?? ""} ${team.country ?? ""}`.toLowerCase().includes(query.toLowerCase())), [teams, query]);
  const draftLeagues = useAdminLeagues(draft.sport).data ?? [];

  function openNew() { setEditing(null); setDraft(emptyDraft()); setOpen(true); }
  function openEdit(team: TeamRow) {
    setEditing(team);
    setDraft({ name: team.name, short_name: team.short_name ?? "", slug: team.slug, sport: team.sport, country: team.country ?? "", logo_url: team.logo_url ?? "", league_ids: team.league_ids, is_active: team.is_active });
    setOpen(true);
  }
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-teams"] }),
      queryClient.invalidateQueries({ queryKey: ["league-teams"] }),
      queryClient.invalidateQueries({ queryKey: ["leagues"] }),
    ]);
  }
  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) { toast.error("El escudo debe pesar menos de 2 MB."); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `teams/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("sports-assets").upload(path, file);
    if (error) { toast.error("No se pudo subir el escudo."); return; }
    const { data } = supabase.storage.from("sports-assets").getPublicUrl(path);
    setDraft((d) => ({ ...d, logo_url: data.publicUrl }));
  }
  async function save() {
    if (!draft.name.trim()) { toast.error("Escribe el nombre del equipo."); return; }
    if (!draft.league_ids.length) { toast.error("Asigna el equipo al menos a una liga."); return; }
    const selectedLeagues = draftLeagues.filter((league) => draft.league_ids.includes(league.id));
    if (selectedLeagues.some((league) => league.sport !== draft.sport)) { toast.error("Todas las ligas seleccionadas deben pertenecer al mismo deporte del equipo."); return; }
    if (draft.is_active && !selectedLeagues.some((league) => league.is_active)) { toast.error("Un equipo activo debe pertenecer al menos a una liga activa."); return; }
    const slug = draft.slug.trim() || slugify(draft.name);
    if (!slug) { toast.error("El slug no es válido."); return; }

    setBusy(true);
    try {
      if (editing && editing.sport !== draft.sport) {
        const { data: relatedPick, error: pickCheckError } = await supabase
          .from("picks")
          .select("id")
          .or(`home_team_id.eq.${editing.id},away_team_id.eq.${editing.id}`)
          .limit(1)
          .maybeSingle();
        if (pickCheckError) throw pickCheckError;
        if (relatedPick) {
          toast.error("No puedes cambiar el deporte de un equipo que ya aparece en picks históricos. Crea un equipo nuevo si necesitas otra disciplina.");
          return;
        }
      }

      const payload = {
        name: draft.name.trim(),
        short_name: draft.short_name.trim() || null,
        slug,
        sport: draft.sport,
        country: draft.country.trim() || null,
        logo_url: draft.logo_url.trim() || null,
        is_active: draft.is_active,
      };

      let teamId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("teams").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("teams").insert(payload).select("id").single();
        if (error) throw error;
        teamId = data.id;
      }
      if (!teamId) throw new Error("team-id-missing");

      const { data: existingLinks, error: linksReadError } = await supabase
        .from("league_teams")
        .select("league_id,is_active")
        .eq("team_id", teamId);
      if (linksReadError) throw linksReadError;

      const desired = new Set(draft.league_ids);
      const omitted = (existingLinks ?? []).filter((link) => link.is_active && !desired.has(link.league_id)).map((link) => link.league_id);
      if (omitted.length) {
        const { error } = await supabase
          .from("league_teams")
          .update({ is_active: false })
          .eq("team_id", teamId)
          .in("league_id", omitted);
        if (error) throw error;
      }

      const { error: upsertError } = await supabase.from("league_teams").upsert(
        draft.league_ids.map((league_id) => ({ league_id, team_id: teamId!, is_active: true })),
        { onConflict: "league_id,team_id" },
      );
      if (upsertError) throw upsertError;

      toast.success(editing ? "Equipo actualizado" : "Equipo creado");
      setOpen(false);
      await refresh();
    } catch (error: unknown) {
      console.error(error);
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      toast.error(code === "23505" ? "Ya existe un equipo con ese slug." : "No se pudo guardar completamente el equipo. Revisa los datos e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(team: TeamRow) {
    if (!window.confirm(`¿Eliminar ${team.name}? Solo será posible si no tiene picks relacionados.`)) return;
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) { toast.error("No se puede eliminar el equipo mientras tenga picks relacionados."); return; }
    toast.success("Equipo eliminado"); await refresh();
  }
  function toggleLeague(id: string) {
    setDraft((d) => ({ ...d, league_ids: d.league_ids.includes(id) ? d.league_ids.filter((value) => value !== id) : [...d.league_ids, id] }));
  }

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Button variant="ghost" size="sm" asChild className="-ml-3 mb-2"><Link to="/admin"><ArrowLeft className="size-4" /> Volver al admin</Link></Button><h1 className="font-display text-3xl font-extrabold">Equipos</h1><p className="mt-1 text-sm text-muted-foreground">Administra nombres, escudos y pertenencia a ligas.</p></div><Button onClick={openNew} className="bg-gradient-brand text-primary-foreground"><Plus className="size-4" /> Nuevo equipo</Button></div>
    <div className="mt-6 flex flex-wrap gap-3"><Input className="max-w-sm" placeholder="Buscar equipo…" value={query} onChange={(e) => setQuery(e.target.value)} /><Select value={sport} onValueChange={(v) => setSport(v as Sport | "all")}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los deportes</SelectItem>{Object.entries(SPORT_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2">{filtered.map((team) => <div key={team.id} className="surface-card flex items-center gap-4 rounded-2xl border border-border/70 p-4"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-background">{team.logo_url ? <img src={team.logo_url} alt="" className="size-11 object-contain" /> : <span className="font-display text-sm font-bold text-muted-foreground">{(team.short_name || team.name).slice(0, 2).toUpperCase()}</span>}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{team.name}</p><p className="text-xs text-muted-foreground">{SPORT_LABEL[team.sport]} · {team.country || "Sin país"} · {team.league_ids.length} liga(s)</p><p className="mt-1 text-[11px] text-muted-foreground">{team.is_active ? "Activo" : "Inactivo"}</p></div><Button size="icon" variant="secondary" onClick={() => openEdit(team)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" onClick={() => remove(team)}><Trash2 className="size-4 text-destructive" /></Button></div>)}</div>
    {!filtered.length && <div className="mt-10 text-center text-sm text-muted-foreground">No hay equipos que coincidan con la búsqueda.</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Editar equipo" : "Nuevo equipo"}</DialogTitle></DialogHeader><div className="space-y-4">
      <Field label="Nombre"><Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: editing ? d.slug : slugify(e.target.value) }))} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre corto"><Input value={draft.short_name} onChange={(e) => setDraft((d) => ({ ...d, short_name: e.target.value }))} placeholder="MCI" /></Field><Field label="Slug"><Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} /></Field><Field label="Deporte"><Select value={draft.sport} onValueChange={(v) => setDraft((d) => ({ ...d, sport: v as Sport, league_ids: [] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SPORT_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="País"><Input value={draft.country} onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))} /></Field></div>
      <Field label="Escudo"><div className="flex gap-3"><Input value={draft.logo_url} onChange={(e) => setDraft((d) => ({ ...d, logo_url: e.target.value }))} placeholder="URL o sube un archivo" /><Button variant="secondary" asChild><label className="cursor-pointer"><Upload className="size-4" /> Subir<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label></Button></div></Field>
      {draft.logo_url && <img src={draft.logo_url} alt="Preview" className="size-16 rounded-full border object-contain p-1" />}
      <div><Label className="text-xs text-muted-foreground">Ligas</Label><div className="mt-2 grid gap-2 sm:grid-cols-2">{draftLeagues.map((league) => { const checked = draft.league_ids.includes(league.id); return <label key={league.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 p-3 text-sm"><input type="checkbox" checked={checked} disabled={!league.is_active && !checked} onChange={() => toggleLeague(league.id)} /> <span>{league.name}{!league.is_active ? " · inactiva" : ""}</span></label>; })}</div>{!draftLeagues.length && <p className="mt-2 text-xs text-muted-foreground">Primero crea una liga para este deporte.</p>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} /> Equipo activo</label>
      <Button className="w-full" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar equipo"}</Button>
    </div></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>; }
