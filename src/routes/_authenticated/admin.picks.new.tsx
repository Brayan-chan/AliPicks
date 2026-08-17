import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { PickEditor } from "@/components/admin/PickEditor";
import { useMyAccount, useSession } from "@/hooks/use-alipicks";

export const Route = createFileRoute("/_authenticated/admin/picks/new")({
  head: () => ({
    meta: [{ title: "Nuevo pick — AliPicks Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPickPage,
});

function NewPickPage() {
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
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Acceso restringido</h1>
        </div>
      </Layout>
    );
  return (
    <Layout>
      <div className="admin-editor-page mx-auto max-w-[1480px] px-4 py-6 lg:px-8 lg:py-8">
        <div className="admin-editor-hero mb-6 overflow-hidden rounded-[28px] border border-border/70 px-5 py-6 sm:px-7 lg:px-8">
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="admin-editor-kicker">AliPicks Studio · Nuevo análisis</div>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Construye el pick como una pieza editorial
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Define el evento, captura las cuatro salidas del modelo y deja listo el contenido
                para publicar o resolver después del partido.
              </p>
            </div>
            <div className="admin-editor-status-pill">
              <span className="admin-editor-status-dot" />
              Borrador editable
            </div>
          </div>
        </div>
        <PickEditor />
      </div>
    </Layout>
  );
}
