import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createCheckout } from "@/lib/payments.functions";
import { money, PICK_TYPE_LABEL, type Pick } from "@/lib/alipicks";
import { useMyAccount, useSession } from "@/hooks/use-alipicks";

export function UnlockDialog({
  pick,
  open,
  onOpenChange,
}: {
  pick: Pick | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const navigate = useNavigate();
  const checkout = useServerFn(createCheckout);
  const [loading, setLoading] = useState<string | null>(null);

  if (!pick) return null;

  const bought = account?.purchases.length ?? 0;
  const requiresPro = pick.min_plan_tier >= 2;

  async function go(kind: "pick" | "plan", id: string) {
    setLoading(kind);
    try {
      const res = await checkout({ data: { kind, id } });
      if (res.url) window.location.href = res.url;
      else toast.info(res.message ?? "No se pudo iniciar el pago.");
    } catch {
      toast.error("No se pudo iniciar el pago. Inténtalo de nuevo.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-gold" /> Análisis premium
          </DialogTitle>
          <DialogDescription>
            {pick.teams} · {PICK_TYPE_LABEL[pick.pick_type]}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Inicia sesión o regístrate para acceder al análisis premium.
            </p>
            <Button
              className="w-full bg-gradient-brand text-primary-foreground"
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/auth", search: { redirect: `/picks/${pick.id}` } });
              }}
            >
              Iniciar sesión o registrarme
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {requiresPro && (
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
                Los marcadores exactos y parlays del día solo están disponibles en los planes Pro y
                VIP.
              </div>
            )}

            {!requiresPro && (
              <button
                disabled={loading !== null}
                onClick={() => go("pick", pick.id)}
                className="w-full rounded-xl border border-border bg-secondary/50 p-4 text-left transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <p className="font-semibold">Comprar este pick por {money(pick.price_cents)}</p>
                <p className="text-xs text-muted-foreground">
                  Acceso permanente al análisis avanzado de este pick.
                </p>
              </button>
            )}

            <button
              disabled={loading !== null}
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/planes" });
              }}
              className="w-full rounded-xl border border-primary/50 bg-gradient-brand p-4 text-left text-primary-foreground glow-brand disabled:opacity-60"
            >
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4" /> Suscribirme al plan Pro
              </p>
              <p className="text-xs opacity-90">
                Acceso ilimitado a todo el análisis premium de fútbol y MLB.
              </p>
            </button>

            {bought >= 1 && (
              <p className="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-xs text-success">
                <TrendingUp className="mt-0.5 size-3.5 shrink-0" />
                Has desbloqueado {bought} predicci{bought === 1 ? "ón" : "ones"} por separado. Te sale más
                barato suscribirte al plan Pro que desbloquear una por una.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Las predicciones no son garantías de resultado. Juega de forma responsable. +18
        </p>
      </DialogContent>
    </Dialog>
  );
}
