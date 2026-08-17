-- AliPicks sports domain - Step 1
-- Creates normalized league/team entities and the four structured prediction slots.
-- Score predictions intentionally have NO risk and NO odds: they are model projections,
-- not betting recommendations.

-- -----------------------------------------------------------------------------
-- Prediction kind enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'prediction_kind'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.prediction_kind AS ENUM (
      'primary',
      'secondary',
      'primary_score',
      'alt_score'
    );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Leagues
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport public.sport NOT NULL,
  name text NOT NULL,
  short_name text,
  country text,
  season text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leagues_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS leagues_unique_identity
  ON public.leagues (
    sport,
    lower(name),
    coalesce(lower(country), ''),
    coalesce(lower(season), '')
  );

CREATE INDEX IF NOT EXISTS leagues_sport_active_idx
  ON public.leagues (sport, is_active);

GRANT SELECT ON public.leagues TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY leagues_public_read
  ON public.leagues
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY leagues_admin_write
  ON public.leagues
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- Teams
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport public.sport NOT NULL,
  name text NOT NULL,
  short_name text,
  country text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_unique_sport_name
  ON public.teams (sport, lower(name));

CREATE INDEX IF NOT EXISTS teams_sport_active_idx
  ON public.teams (sport, is_active);

GRANT SELECT ON public.teams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_public_read
  ON public.teams
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY teams_admin_write
  ON public.teams
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- League/team membership
-- A team may belong to multiple leagues over time or simultaneously.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, team_id)
);

CREATE INDEX IF NOT EXISTS league_teams_league_idx
  ON public.league_teams (league_id, is_active);

CREATE INDEX IF NOT EXISTS league_teams_team_idx
  ON public.league_teams (team_id);

GRANT SELECT ON public.league_teams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.league_teams TO authenticated;
GRANT ALL ON public.league_teams TO service_role;
ALTER TABLE public.league_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY league_teams_public_read
  ON public.league_teams
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY league_teams_admin_write
  ON public.league_teams
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- Structured predictions
-- Every pick package can own up to four prediction records:
-- primary, secondary, primary_score and alt_score.
--
-- Important product rule:
-- primary_score / alt_score are model score projections only. They intentionally
-- do not carry risk or odds so the UI does not frame them as betting picks.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pick_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id uuid NOT NULL REFERENCES public.picks(id) ON DELETE CASCADE,
  kind public.prediction_kind NOT NULL,

  -- Used by primary / secondary predictions.
  market_type public.pick_type,
  selection text,
  line numeric(8,2),

  -- Used only by score projections.
  predicted_home_score integer,
  predicted_away_score integer,

  -- Shared model metadata.
  confidence integer NOT NULL,

  -- Betting metadata. Must be NULL for score projections.
  risk public.risk_level,
  odds numeric(8,2),

  -- Independent settlement result for each of the four projections.
  result public.pick_status NOT NULL DEFAULT 'pending',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pick_id, kind),

  CONSTRAINT pick_predictions_confidence_range
    CHECK (confidence BETWEEN 1 AND 100),

  CONSTRAINT pick_predictions_scores_non_negative
    CHECK (
      (predicted_home_score IS NULL OR predicted_home_score >= 0)
      AND (predicted_away_score IS NULL OR predicted_away_score >= 0)
    ),

  CONSTRAINT pick_predictions_odds_valid
    CHECK (odds IS NULL OR odds > 1),

  CONSTRAINT pick_predictions_shape
    CHECK (
      (
        kind IN ('primary', 'secondary')
        AND market_type IS NOT NULL
        AND selection IS NOT NULL
        AND length(trim(selection)) > 0
        AND predicted_home_score IS NULL
        AND predicted_away_score IS NULL
        AND risk IS NOT NULL
        AND odds IS NOT NULL
      )
      OR
      (
        kind IN ('primary_score', 'alt_score')
        AND market_type IS NULL
        AND selection IS NULL
        AND line IS NULL
        AND predicted_home_score IS NOT NULL
        AND predicted_away_score IS NOT NULL
        AND risk IS NULL
        AND odds IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS pick_predictions_pick_idx
  ON public.pick_predictions (pick_id);

CREATE INDEX IF NOT EXISTS pick_predictions_kind_result_idx
  ON public.pick_predictions (kind, result);

GRANT SELECT ON public.pick_predictions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pick_predictions TO authenticated;
GRANT ALL ON public.pick_predictions TO service_role;
ALTER TABLE public.pick_predictions ENABLE ROW LEVEL SECURITY;

-- Free published picks may expose their structured predictions publicly.
-- Premium predictions are only readable when has_pick_access() grants access.
CREATE POLICY pick_predictions_read
  ON public.pick_predictions
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.picks p
      WHERE p.id = pick_predictions.pick_id
        AND p.is_published = true
        AND p.visibility = 'free'
    )
    OR public.has_pick_access(auth.uid(), pick_predictions.pick_id)
  );

CREATE POLICY pick_predictions_admin_write
  ON public.pick_predictions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.leagues IS
  'Canonical leagues used by the admin pick editor and public pick views.';

COMMENT ON TABLE public.teams IS
  'Canonical sports teams. A team can be attached to multiple leagues through league_teams.';

COMMENT ON TABLE public.pick_predictions IS
  'The four structured model projections attached to a pick package.';

COMMENT ON COLUMN public.pick_predictions.risk IS
  'Only primary/secondary predictions have risk. Score projections intentionally keep this NULL.';

COMMENT ON COLUMN public.pick_predictions.odds IS
  'Only primary/secondary predictions have odds. Score projections intentionally keep this NULL.';
