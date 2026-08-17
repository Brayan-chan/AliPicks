import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ExtraTab, Pick, Plan, Purchase, Subscription } from "@/lib/alipicks";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function usePicks() {
  return useQuery({
    queryKey: ["picks"],
    queryFn: async (): Promise<Pick[]> => {
      const { data, error } = await supabase
        .from("picks")
        .select("*")
        .order("event_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePick(id: string) {
  return useQuery({
    queryKey: ["pick", id],
    queryFn: async (): Promise<Pick | null> => {
      const { data, error } = await supabase.from("picks").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("tier", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePremium(pickId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["premium", pickId],
    enabled: Boolean(pickId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pick_premium")
        .select("*")
        .eq("pick_id", pickId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyAccount(userId: string | undefined) {
  return useQuery({
    queryKey: ["account", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [purchases, subs, roles, profile] = await Promise.all([
        supabase.from("pick_purchases").select("*").eq("user_id", userId!),
        supabase.from("subscriptions").select("*, plans(*)").eq("user_id", userId!),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
      ]);
      const subscription =
        (subs.data ?? []).find((s) => s.status === "active") ?? (subs.data ?? [])[0] ?? null;
      return {
        purchases: (purchases.data ?? []) as Purchase[],
        subscription: subscription as (Subscription & { plans: Plan | null }) | null,
        isAdmin: (roles.data ?? []).some((r) => r.role === "admin"),
        profile: profile.data ?? null,
      };
    },
  });
}

export type Account = NonNullable<ReturnType<typeof useMyAccount>["data"]>;

export function hasPickAccess(pick: Pick, account: Account | undefined) {
  if (pick.visibility === "free") return true;
  if (!account) return false;
  if (account.isAdmin) return true;
  if (account.purchases.some((p) => p.pick_id === pick.id && p.status === "paid")) return true;
  const sub = account.subscription;
  if (!sub || sub.status !== "active" || !sub.plans) return false;
  if (sub.plans.tier < Math.max(pick.min_plan_tier, 1)) return false;
  if (sub.sport_scope && sub.sport_scope !== pick.sport) return false;
  return true;
}

export function planTier(account: Account | undefined) {
  if (!account) return 0;
  if (account.isAdmin) return 3;
  const sub = account.subscription;
  if (!sub || sub.status !== "active" || !sub.plans) return 0;
  return sub.plans.tier;
}

/** Pestañas de datos visibles según el plan del usuario. */
export function visibleTabs(tabs: ExtraTab[], tier: number, unlocked: boolean) {
  if (unlocked || tier >= 2) return tabs;
  if (tier === 1) return tabs.slice(0, 3);
  return tabs.slice(0, 1);
}

export function useFollows(userId: string | undefined) {
  return useQuery({
    queryKey: ["follows", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pick_follows")
        .select("pick_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((f) => f.pick_id);
    },
  });
}

export function useToggleFollow(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pickId, following }: { pickId: string; following: boolean }) => {
      if (!userId) return;
      if (following) {
        await supabase.from("pick_follows").delete().eq("user_id", userId).eq("pick_id", pickId);
      } else {
        await supabase.from("pick_follows").insert({ user_id: userId, pick_id: pickId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follows", userId] }),
  });
}

/** Registra la visualización de una predicción para el historial del perfil. */
export function useLogView(userId: string | undefined, pickId: string | undefined) {
  useEffect(() => {
    if (!userId || !pickId) return;
    void supabase.from("pick_views").insert({ user_id: userId, pick_id: pickId });
  }, [userId, pickId]);
}

export function useMyViews(userId: string | undefined) {
  return useQuery({
    queryKey: ["views", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pick_views")
        .select("id, viewed_at, picks(*)")
        .eq("user_id", userId!)
        .order("viewed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; viewed_at: string; picks: Pick | null }[];
    },
  });
}
