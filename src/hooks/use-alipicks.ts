import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ExtraTab, Pick, Plan, Purchase, Subscription } from "@/lib/alipicks";
import type { League, StructuredPick, Team } from "@/lib/sports-domain";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, loading };
}

const STRUCTURED_PICK_SELECT = `
  *,
  league_ref:leagues!picks_league_id_fkey(*),
  home_team_ref:teams!picks_home_team_id_fkey(*),
  away_team_ref:teams!picks_away_team_id_fkey(*),
  predictions:pick_predictions(*)
`;

export function usePicks() {
  return useQuery({
    queryKey: ["picks"],
    queryFn: async (): Promise<Pick[]> => {
      const { data, error } = await supabase.from("picks").select("*").order("event_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStructuredPicks() {
  return useQuery({
    queryKey: ["picks", "structured"],
    queryFn: async (): Promise<StructuredPick[]> => {
      const { data, error } = await supabase.from("picks").select(STRUCTURED_PICK_SELECT).order("event_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StructuredPick[];
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

export function useStructuredPick(id: string) {
  return useQuery({
    queryKey: ["pick", id, "structured"],
    enabled: Boolean(id),
    queryFn: async (): Promise<StructuredPick | null> => {
      const { data, error } = await supabase.from("picks").select(STRUCTURED_PICK_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as StructuredPick | null;
    },
  });
}

export function useLeagues(sport?: string) {
  return useQuery({
    queryKey: ["leagues", sport ?? "all"],
    queryFn: async (): Promise<League[]> => {
      let query = supabase.from("leagues").select("*").eq("is_active", true).order("name");
      if (sport) query = query.eq("sport", sport as League["sport"]);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLeagueTeams(leagueId?: string) {
  return useQuery({
    queryKey: ["league-teams", leagueId],
    enabled: Boolean(leagueId),
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from("league_teams")
        .select("team:teams(*)")
        .eq("league_id", leagueId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.team)
        .filter((team): team is Team => Boolean(team));
    },
  });
}

export function usePlans() { return useQuery({ queryKey: ["plans"], queryFn: async (): Promise<Plan[]> => { const { data, error } = await supabase.from("plans").select("*").order("tier", { ascending: true }); if (error) throw error; return data ?? []; } }); }
export function usePremium(pickId: string | undefined, enabled: boolean) { return useQuery({ queryKey: ["premium", pickId], enabled: Boolean(pickId) && enabled, queryFn: async () => { const { data, error } = await supabase.from("pick_premium").select("*").eq("pick_id", pickId!).maybeSingle(); if (error) throw error; return data; } }); }

export function useMyAccount(userId: string | undefined) {
  return useQuery({ queryKey: ["account", userId], enabled: Boolean(userId), queryFn: async () => {
    const [purchases, subs, roles, profile] = await Promise.all([
      supabase.from("pick_purchases").select("*").eq("user_id", userId!),
      supabase.from("subscriptions").select("*, plans(*)").eq("user_id", userId!),
      supabase.from("user_roles").select("role").eq("user_id", userId!),
      supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
    ]);
    const subscription = (subs.data ?? []).find((s) => s.status === "active") ?? (subs.data ?? [])[0] ?? null;
    return { purchases: (purchases.data ?? []) as Purchase[], subscription: subscription as (Subscription & { plans: Plan | null }) | null, isAdmin: (roles.data ?? []).some((r) => r.role === "admin"), profile: profile.data ?? null };
  } });
}

export type Account = NonNullable<ReturnType<typeof useMyAccount>["data"]>;
export function hasPickAccess(pick: Pick, account: Account | undefined) { if (pick.visibility === "free") return true; if (!account) return false; if (account.isAdmin) return true; if (account.purchases.some((p) => p.pick_id === pick.id && p.status === "paid")) return true; const sub = account.subscription; if (!sub || sub.status !== "active" || !sub.plans) return false; if (sub.plans.tier < Math.max(pick.min_plan_tier, 1)) return false; if (sub.sport_scope && sub.sport_scope !== pick.sport) return false; return true; }
export function planTier(account: Account | undefined) { if (!account) return 0; if (account.isAdmin) return 3; const sub = account.subscription; if (!sub || sub.status !== "active" || !sub.plans) return 0; return sub.plans.tier; }
export function visibleTabs(tabs: ExtraTab[], tier: number, unlocked: boolean) { if (unlocked || tier >= 2) return tabs; if (tier === 1) return tabs.slice(0, 3); return tabs.slice(0, 1); }
export function useFollows(userId: string | undefined) { return useQuery({ queryKey: ["follows", userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await supabase.from("pick_follows").select("pick_id").eq("user_id", userId!); if (error) throw error; return (data ?? []).map((f) => f.pick_id); } }); }
export function useToggleFollow(userId: string | undefined) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ pickId, following }: { pickId: string; following: boolean }) => { if (!userId) return; if (following) await supabase.from("pick_follows").delete().eq("user_id", userId).eq("pick_id", pickId); else await supabase.from("pick_follows").insert({ user_id: userId, pick_id: pickId }); }, onSuccess: () => qc.invalidateQueries({ queryKey: ["follows", userId] }) }); }
export function useLogView(userId: string | undefined, pickId: string | undefined) { useEffect(() => { if (!userId || !pickId) return; void supabase.from("pick_views").insert({ user_id: userId, pick_id: pickId }); }, [userId, pickId]); }
export function useMyViews(userId: string | undefined) { return useQuery({ queryKey: ["views", userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await supabase.from("pick_views").select("id, viewed_at, picks(*)").eq("user_id", userId!).order("viewed_at", { ascending: false }).limit(200); if (error) throw error; return (data ?? []) as { id: string; viewed_at: string; picks: Pick | null }[]; } }); }
