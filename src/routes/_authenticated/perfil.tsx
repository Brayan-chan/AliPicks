import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccount, useMyViews, usePicks, useSession } from "@/hooks/use-alipicks";
import { formatDateTime, formatEventDate, money } from "@/lib/alipicks";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — AliPicks" },
      {
        name: "description",
        content: "Gestiona tu plan, revisa tus predicciones desbloqueadas y tu historial en AliPicks.",
      },
      { property: "og:title", content: "Mi perfil — AliPicks" },
      { property: "og:description", content: "Tu plan, tus compras y tu actividad." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const { data: picks } = usePicks();
  const { data: views } = useMyViews(user?.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sub = account?.subscription;
  const purchased = (account?.purchases ?? []).map((p) => ({
    purchase: p,
    pick: (picks ?? []).find((x) => x.id === p.pick_id),
  }));

  async function cancel() {
    if (!sub) return;
    const { error } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("id", sub.id);
    if (error) {
      toast.error("No se pudo procesar la cancelación.");
      return;
    }
    toast.success("Tu suscripción quedó marcada como 'por cancelar'. El equipo fue avisado.");
    queryClient.invalidateQueries({ queryKey: ["account"] });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold">Mi perfil</h1>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>

        <Card title="Datos básicos">
          <p className="text-sm text-muted-foreground">
            {account?.profile?.full_name || "Sin nombre"} · {user?.email}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mayor de 18 años: {account?.profile?.is_adult ? "confirmado" : "sin confirmar"}
          </p>
        </Card>

        <Card title="Mi plan">
          {sub && sub.status === "active" && sub.plans ? (
            <div className="space-y-1 text-sm">
              <p className="font-display text-xl font-bold">{sub.plans.name}</p>
              <p className="text-muted-foreground">
                {money(sub.plans.price_cents)}/mes
                {sub.sport_scope ? ` · solo ${sub.sport_scope}` : ""}
              </p>
              <p className="text-muted-foreground">
                Renovación:{" "}
                {sub.current_period_end ? formatEventDate(sub.current_period_end) : "por definir"}
              </p>
              {sub.cancel_at_period_end && (
                <p className="text-warning">Marcada como "por cancelar".</p>
              )}
              <div className="flex flex-wrap gap-2 pt-3">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/planes">Cambiar plan</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel} disabled={sub.cancel_at_period_end}>
                  Cancelar suscripción
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p>Sin plan activo.</p>
              <Button asChild size="sm" className="mt-3 bg-gradient-brand text-primary-foreground">
                <Link to="/planes">Ver planes</Link>
              </Button>
            </div>
          )}
        </Card>

        <Card title="Mis compras">
          {purchased.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has comprado picks individuales.</p>
          ) : (
            <div className="space-y-2">
              {purchased.map(({ purchase, pick }) => (
                <div
                  key={purchase.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{pick?.teams ?? "Pick"}</p>
                    <p className="text-xs text-muted-foreground">
                      {money(purchase.amount_cents)} ·{" "}
                      {formatEventDate(purchase.created_at)}
                    </p>
                  </div>
                  {pick && (
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/picks/$id" params={{ id: pick.id }}>
                        Ver pick
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Predicciones que has visto">
          {(views ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no has abierto ninguna predicción.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(views ?? []).slice(0, 20).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {v.picks ? (
                      <Link className="hover:text-gold" to="/picks/$id" params={{ id: v.picks.id }}>
                        {v.picks.teams}
                      </Link>
                    ) : (
                      "Predicción no disponible"
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(v.viewed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Historial de actividad">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {sub && <li>Suscripción {sub.plans?.name} · estado {sub.status}</li>}
            {purchased.map(({ purchase, pick }) => (
              <li key={purchase.id}>
                Compraste “{pick?.teams ?? "pick"}” por {money(purchase.amount_cents)}
              </li>
            ))}
            {!sub && purchased.length === 0 && <li>Sin actividad todavía.</li>}
          </ul>
        </Card>
      </div>
    </Layout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-card rounded-2xl border border-border/70 p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
