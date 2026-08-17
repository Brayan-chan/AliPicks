import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { confirmCheckout } from "@/lib/payments.functions";
import { useSession } from "@/hooks/use-alipicks";

export const Route = createFileRoute("/pago")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirmación de pago — AliPicks" },
      {
        name: "description",
        content: "Confirmamos tu pago y activamos tu acceso a los picks exclusivos de AliPicks.",
      },
      { property: "og:title", content: "Confirmación de pago — AliPicks" },
      { property: "og:description", content: "Tu acceso a AliPicks se activa en segundos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentReturnPage,
});

function PaymentReturnPage() {
  const { session_id } = Route.useSearch();
  const { user, loading } = useSession();
  const confirm = useServerFn(confirmCheckout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const done = useRef(false);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loading || done.current) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/pago?session_id=${session_id}` } });
      return;
    }
    if (!session_id) {
      setState("error");
      setMessage("No encontramos la referencia del pago.");
      return;
    }
    done.current = true;
    confirm({ data: { sessionId: session_id } })
      .then((res) => {
        if (res.ok) {
          setState("ok");
          setMessage(
            res.kind === "plan"
              ? "Tu plan quedó activo. Ya tienes acceso a los picks exclusivos."
              : "Compra confirmada. El análisis avanzado de este pick ya está desbloqueado.",
          );
          queryClient.invalidateQueries();
        } else {
          setState("error");
          setMessage(res.message ?? "No pudimos confirmar tu pago.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("No pudimos confirmar tu pago. Escríbenos si el cargo aparece en tu banco.");
      });
  }, [loading, user, session_id, confirm, queryClient, navigate]);

  return (
    <Layout>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
        {state === "loading" && (
          <>
            <Loader2 className="size-10 animate-spin text-primary" />
            <h1 className="font-display text-2xl font-extrabold">Confirmando tu pago…</h1>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="size-12 text-success" />
            <h1 className="font-display text-2xl font-extrabold">¡Listo!</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-2 pt-2">
              <Button asChild className="bg-gradient-brand text-primary-foreground">
                <Link to="/picks">Ver picks</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/perfil">Mi perfil</Link>
              </Button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="size-12 text-destructive" />
            <h1 className="font-display text-2xl font-extrabold">Algo no salió bien</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="secondary" className="mt-2">
              <Link to="/planes">Volver a planes</Link>
            </Button>
          </>
        )}
      </div>
    </Layout>
  );
}
