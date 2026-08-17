import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { PickEditor } from "@/components/admin/PickEditor";
import { useMyAccount, useSession, useStructuredPick } from "@/hooks/use-alipicks";

export const Route = createFileRoute("/_authenticated/admin/picks/$id")({
  head: () => ({
    meta: [{ title: "Editar pick — AliPicks Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: EditPickPage,
});

function EditPickPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const { data: account, isLoading: accountLoading } = useMyAccount(user?.id);
  const { data: pick, isLoading: pickLoading } = useStructuredPick(id);
  if (accountLoading || pickLoading)
    return (
      <Layout>
        <div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando editor…</div>
      </Layout>
    );
  if (!account?.isAdmin)
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Acceso restringido</h1>
        </div>
      </Layout>
    );
  if (!pick)
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Pick no encontrado</h1>
        </div>
      </Layout>
    );
  return (
    <Layout>
      <div className="admin-editor-page mx-auto max-w-[1480px] px-4 py-6 lg:px-8 lg:py-8">
        <div className="admin-editor-hero mb-6 overflow-hidden rounded-[28px] border border-border/70 px-5 py-6 sm:px-7 lg:px-8">
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="admin-editor-kicker">AliPicks Studio · Pick existente</div>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Edita, monitorea y resuelve el análisis
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Partido, predicciones, lifecycle y publicación viven en un mismo espacio de trabajo
                para reducir errores durante la operación.
              </p>
            </div>
            <div className="admin-editor-status-pill">
              <span className="admin-editor-status-dot" />
              Editor operativo
            </div>
          </div>
        </div>
        <PickEditor pick={pick} />
      </div>
    </Layout>
  );
}
