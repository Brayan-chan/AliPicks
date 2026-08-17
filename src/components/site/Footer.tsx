import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-display text-base font-bold">AliPicks</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Plataforma de análisis y proyecciones deportivas de fútbol y MLB, con historial
            verificable y metodología pública.
          </p>
        </div>
        <div className="text-sm">
          <p className="font-semibold">Producto</p>
          <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
            <Link to="/picks" className="transition-colors hover:text-foreground">
              Predicciones
            </Link>
            <Link to="/historial" className="transition-colors hover:text-foreground">
              Historial y rendimiento
            </Link>
            <Link to="/metodologia" className="transition-colors hover:text-foreground">
              Metodología
            </Link>
            <Link to="/planes" className="transition-colors hover:text-foreground">
              Planes
            </Link>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Transparencia</p>
          <p className="mt-3 leading-relaxed">
            Las predicciones son estimaciones basadas en datos. Los resultados deportivos no están
            garantizados. AliPicks ofrece análisis informativo y no permite realizar operaciones de
            juego dentro de la plataforma.
          </p>
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AliPicks · Contenido analítico para mayores de 18 años
      </div>
    </footer>
  );
}
