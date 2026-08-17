import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { PickEditor } from "@/components/admin/PickEditor";
import { useMyAccount, useSession } from "@/hooks/use-alipicks";

export const Route = createFileRoute("/_authenticated/admin/picks/new")({
  head: () => ({ meta: [{ title: "Nuevo pick — AliPicks Admin" }, { name: "robots", content: "noindex" }] }),
  component: NewPickPage,
});

function NewPickPage() {
  const { user } = useSession();
  const { data: account, isLoading } = useMyAccount(user?.id);
  if (isLoading) return <Layout><div className="px-4 py-20 text-center text-sm text-muted-foreground">Cargando…</div></Layout>;
  if (!account?.isAdmin) return <Layout><div className="mx-auto max-w-md px-4 py-20 text-center"><h1 className="font-display text-2xl font-bold">Acceso restringido</h1></div></Layout>;
  return <Layout><div className="mx-auto max-w-7xl px-4 py-8 lg:px-8"><div className="mb-7"><p className="eyebrow">Admin · Picks</p><h1 className="mt-2 font-display text-3xl font-extrabold">Nuevo pick</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Registra el partido una vez y captura las cuatro salidas del modelo en una sola pantalla.</p></div><PickEditor /></div></Layout>;
}
