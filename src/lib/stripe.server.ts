const STRIPE_API = "https://api.stripe.com/v1";

function encode(form: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  return params.toString();
}

export async function stripeRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string | number | undefined | null> } = {
    method: "GET",
  },
): Promise<T> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe no está configurado.");

  const body = init.form ? encode(init.form) : undefined;
  const url = init.method === "GET" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;

  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(init.method === "POST" && body ? { body } : {}),
  });

  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    console.error("Stripe error", json.error);
    throw new Error(json.error?.message ?? "Error de Stripe");
  }
  return json as T;
}
