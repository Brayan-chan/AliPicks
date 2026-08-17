import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useSession } from "@/hooks/use-alipicks";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar o registrarse — AliPicks" },
      {
        name: "description",
        content:
          "Crea tu cuenta en AliPicks para desbloquear picks exclusivos y análisis avanzado de soccer y MLB. Solo mayores de 18 años.",
      },
      { property: "og:title", content: "Entrar o registrarse — AliPicks" },
      {
        property: "og:description",
        content: "Accede a tus picks exclusivos y a tu historial de compras.",
      },
    ],
  }),
  component: AuthPage,
});

const credsSchema = z.object({
  email: z.string().trim().email("Correo no válido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const [loading, setLoading] = useState(false);

  const target = redirect && redirect.startsWith("/") ? redirect : "/";

  useEffect(() => {
    if (user) navigate({ to: target, replace: true });
  }, [user, target, navigate]);

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No se pudo iniciar sesión con Google.");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: target });
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="surface-card rounded-2xl border border-border/70 p-6">
          <h1 className="font-display text-2xl font-extrabold">Bienvenido a AliPicks</h1>
          {redirect && (
            <p className="mt-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
              Inicia sesión o regístrate para acceder a picks exclusivos.
            </p>
          )}

          <Tabs defaultValue="login" className="mt-5">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                Iniciar sesión
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Registrarme
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm disabled={loading} onDone={() => navigate({ to: target })} />
            </TabsContent>
            <TabsContent value="signup">
              <SignupForm disabled={loading} onDone={() => navigate({ to: target })} />
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="secondary" className="w-full" onClick={handleGoogle} disabled={loading}>
            Continuar con Google
          </Button>

          <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            Solo para mayores de 18 años. AliPicks ofrece predicciones con fines informativos y de
            entretenimiento. No garantizamos ganancias. Apuesta con responsabilidad.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link to="/" className="underline">
              Volver al inicio
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

function LoginForm({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    if (!adult) {
      toast.error("Debes confirmar que eres mayor de 18 años.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error("Credenciales incorrectas.");
      return;
    }
    toast.success("Sesión iniciada");
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Correo" value={email} onChange={setEmail} type="email" />
      <Field label="Contraseña" value={password} onChange={setPassword} type="password" />
      <AdultCheck checked={adult} onChange={setAdult} />
      <Button
        type="submit"
        className="w-full bg-gradient-brand text-primary-foreground"
        disabled={busy || disabled}
      >
        Entrar
      </Button>
    </form>
  );
}

function SignupForm({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    if (!adult) {
      toast.error("Debes confirmar que eres mayor de 18 años.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name.trim().slice(0, 100), is_adult: true },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cuenta creada. ¡Bienvenido!");
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Nombre" value={name} onChange={setName} />
      <Field label="Correo" value={email} onChange={setEmail} type="email" />
      <Field label="Contraseña" value={password} onChange={setPassword} type="password" />
      <AdultCheck checked={adult} onChange={setAdult} />
      <Button
        type="submit"
        className="w-full bg-gradient-brand text-primary-foreground"
        disabled={busy || disabled}
      >
        Crear cuenta
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="mt-1"
        type={type}
        value={value}
        maxLength={255}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  );
}

function AdultCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      Soy mayor de 18 años y acepto los términos y el aviso de apuesta responsable.
    </label>
  );
}
