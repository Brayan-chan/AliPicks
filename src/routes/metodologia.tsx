import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Database, FileClock, LineChart, ScanSearch, Trophy } from "lucide-react";
import { Layout, ResponsibleNotice } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/metodologia")({
  head: () => ({
    meta: [
      { title: "Metodología de análisis — AliPicks" },
      {
        name: "description",
        content:
          "Cómo AliPicks recopila datos, analiza variables, genera proyecciones deportivas y registra cada predicción publicada para su verificación.",
      },
      { property: "og:title", content: "Metodología de análisis — AliPicks" },
      {
        property: "og:description",
        content: "Datos, análisis, proyección, registro y resultado: el proceso detrás de cada predicción.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MethodologyPage,
});

const STEPS = [
  {
    n: "01",
    title: "Datos",
    icon: Database,
    text: "Se recopilan estadísticas, rendimiento reciente y variables relevantes del evento.",
  },
  {
    n: "02",
    title: "Análisis",
    icon: ScanSearch,
    text: "Los datos se analizan para identificar patrones y escenarios posibles.",
  },
  {
    n: "03",
    title: "Proyección",
    icon: LineChart,
    text: "Los modelos generan estimaciones para diferentes escenarios deportivos.",
  },
  {
    n: "04",
    title: "Registro",
    icon: FileClock,
    text: "Cada predicción publicada queda registrada con su fecha y contenido original.",
  },
  {
    n: "05",
    title: "Resultado",
    icon: Trophy,
    text: "Una vez finalizado el evento, la proyección puede compararse con el resultado final.",
  },
];

function MethodologyPage() {
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-14 lg:px-8">
        <p className="eyebrow">Transparencia</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
          Metodología
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Cada proyección publicada en AliPicks sigue el mismo proceso. Explicamos el método sin
          revelar el detalle técnico interno de los modelos.
        </p>

        <div className="mt-12 space-y-px overflow-hidden rounded-2xl border border-border bg-border">
          {STEPS.map((s) => (
            <div key={s.n} className="grid gap-4 bg-card p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
              <div className="flex items-center gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-bold text-muted-foreground sm:w-10">
                  {s.n}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="mt-12 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <h3 className="font-display text-base font-bold">Confianza del modelo</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Representa el nivel de confianza asignado por el modelo según las variables
              analizadas. No garantiza que el resultado proyectado ocurra.
            </p>
          </div>
          <div className="rounded-2xl border border-border p-6">
            <h3 className="font-display text-base font-bold">Probabilidad estimada</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Representa una estimación generada a partir de los datos y variables analizadas para
              este evento.
            </p>
          </div>
          <div className="rounded-2xl border border-border p-6">
            <h3 className="font-display text-base font-bold">Rendimiento histórico</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Representa el desempeño de las predicciones finalizadas según la metodología
              utilizada.
            </p>
          </div>
          <div className="rounded-2xl border border-border p-6">
            <h3 className="font-display text-base font-bold">Trazabilidad</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cada predicción muestra su fecha y hora de publicación, el estado del evento y el
              resultado final cuando está disponible.
            </p>
          </div>
        </section>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/historial">
              Ver historial de rendimiento <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/picks">Explorar predicciones</Link>
          </Button>
        </div>

        <div className="mt-10">
          <ResponsibleNotice />
        </div>
      </div>
    </Layout>
  );
}
