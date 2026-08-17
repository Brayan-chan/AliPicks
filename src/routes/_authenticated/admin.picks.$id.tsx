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
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-7">
          <p className="eyebrow">Admin · Picks</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Editar pick</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Actualiza partido, predicciones, resultado real y estado público desde el mismo editor.
          </p>
        </div>
        <PickEditor pick={pick} />
      </div>
    </Layout>
  );
}
