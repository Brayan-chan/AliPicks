import { useState, type ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { DesktopSidebar, MobileSidebar } from "./Sidebar";

export function Layout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar />
      <MobileSidebar open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header onMenu={() => setMenu(true)} />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

/** Nota de transparencia del producto (no promocional). */
export function ResponsibleNotice() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Las proyecciones son estimaciones generadas a partir de datos y variables analizadas. Los
      resultados deportivos no están garantizados y AliPicks no permite realizar operaciones de
      juego dentro de la plataforma.
    </p>
  );
}
