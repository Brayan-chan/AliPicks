import { BarChart3, CreditCard, FlaskConical, Home, LineChart, User } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Inicio", icon: Home, exact: true },
  { to: "/picks", label: "Predicciones", icon: LineChart, exact: false },
  { to: "/historial", label: "Historial", icon: BarChart3, exact: false },
  { to: "/metodologia", label: "Metodología", icon: FlaskConical, exact: false },
  { to: "/planes", label: "Planes", icon: CreditCard, exact: false },
] as const;

export const ACCOUNT_ITEM = { to: "/perfil", label: "Perfil", icon: User } as const;
