
ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS event_state text NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS secondary_selection text,
  ADD COLUMN IF NOT EXISTS secondary_pick_type pick_type,
  ADD COLUMN IF NOT EXISTS secondary_risk risk_level,
  ADD COLUMN IF NOT EXISTS secondary_confidence integer,
  ADD COLUMN IF NOT EXISTS secondary_odds numeric,
  ADD COLUMN IF NOT EXISTS score_primary text,
  ADD COLUMN IF NOT EXISTS score_primary_confidence integer,
  ADD COLUMN IF NOT EXISTS score_secondary text,
  ADD COLUMN IF NOT EXISTS score_secondary_confidence integer,
  ADD COLUMN IF NOT EXISTS factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_tabs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.pick_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pick_id uuid NOT NULL REFERENCES public.picks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pick_id)
);

GRANT SELECT, INSERT, DELETE ON public.pick_follows TO authenticated;
GRANT ALL ON public.pick_follows TO service_role;
ALTER TABLE public.pick_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY follows_select ON public.pick_follows FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY follows_insert ON public.pick_follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY follows_delete ON public.pick_follows FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pick_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pick_id uuid NOT NULL REFERENCES public.picks(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pick_views TO authenticated;
GRANT ALL ON public.pick_views TO service_role;
ALTER TABLE public.pick_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY views_select ON public.pick_views FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY views_insert ON public.pick_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
