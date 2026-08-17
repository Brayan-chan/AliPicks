import { Link } from "@tanstack/react-router";
import { Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyAccount, useSession } from "@/hooks/use-alipicks";
import { PLAN_TIER_NAME } from "@/lib/alipicks";
import { planTier } from "@/hooks/use-alipicks";

export function Header({ onMenu }: { onMenu?: () => void }) {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);
  const tier = planTier(account);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:px-8">
        <button
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          onClick={onMenu}
          aria-label="Abrir navegación"
        >
          <Menu className="size-5" />
        </button>

        <Link to="/" className="min-w-0 lg:hidden">
          <span className="font-display text-base font-extrabold tracking-tight">
            Ali<span className="text-gold">Picks</span>
          </span>
        </Link>
        <span className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground lg:flex">
          <ShieldCheck className="size-3.5 text-gold" />
          Análisis y proyecciones deportivas basadas en datos
        </span>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground sm:inline">
                Plan {PLAN_TIER_NAME[tier] ?? "Gratuito"}
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/perfil">Mi cuenta</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/planes">Ver planes</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Entrar</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
