import { Link } from "@tanstack/react-router";
import { Crown, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_ITEM, NAV_ITEMS } from "./nav-items";
import { useMyAccount, useSession } from "@/hooks/use-alipicks";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useSession();
  const { data: account } = useMyAccount(user?.id);

  const linkClass =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
  const activeClass = "bg-accent text-accent-foreground font-semibold";

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={linkClass}
          activeProps={{ className: activeClass }}
          activeOptions={{ exact: item.exact }}
        >
          <item.icon className="size-[18px] shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
      {user && (
        <Link
          to={ACCOUNT_ITEM.to}
          onClick={onNavigate}
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          <ACCOUNT_ITEM.icon className="size-[18px] shrink-0" />
          <span className="truncate">{ACCOUNT_ITEM.label}</span>
        </Link>
      )}
      {account?.isAdmin && (
        <Link
          to="/admin"
          onClick={onNavigate}
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          <Settings2 className="size-[18px] shrink-0" />
          <span className="truncate">Administración</span>
        </Link>
      )}
    </nav>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-brand text-primary-foreground">
        <Crown className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-extrabold leading-none tracking-tight">
          Ali<span className="text-gold">Picks</span>
        </span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Sports intelligence
        </span>
      </span>
    </Link>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-sidebar px-3 py-6 lg:flex">
      <Brand />
      <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
        <NavList />
      </div>
      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="font-display text-sm font-bold">Análisis completo</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Explora información adicional, métricas y escenarios para analizar el evento con mayor
          profundidad.
        </p>
        <Link
          to="/planes"
          className="mt-3 inline-flex text-xs font-semibold text-gold hover:underline"
        >
          Ver planes →
        </Link>
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cn("lg:hidden", !open && "pointer-events-none")}>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/25 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-border bg-sidebar px-3 py-6 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Brand onNavigate={onClose} />
          <button
            onClick={onClose}
            aria-label="Cerrar navegación"
            className="mr-2 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <NavList onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
