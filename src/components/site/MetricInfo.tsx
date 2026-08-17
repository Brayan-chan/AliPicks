import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const METRIC_HELP = {
  confianza:
    "Representa el nivel de confianza asignado por el modelo según las variables analizadas. No garantiza que el resultado proyectado ocurra.",
  probabilidad:
    "Representa una estimación generada a partir de los datos y variables analizadas para este evento.",
  rendimiento:
    "Representa el desempeño de las predicciones finalizadas según la metodología utilizada.",
} as const;

/** Icono de ayuda con explicación contextual de una métrica. */
export function MetricInfo({ text, label }: { text: string; label?: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label ? `Información sobre ${label}` : "Más información"}
            className="inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
            onClick={(e) => e.preventDefault()}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
