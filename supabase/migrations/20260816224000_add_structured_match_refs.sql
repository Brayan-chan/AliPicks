-- AliPicks sports domain - Step 2
-- Adds canonical league/team references and real match score fields to picks.
-- Legacy text columns remain temporarily during migration.

ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_score integer,
  ADD COLUMN IF NOT EXISTS away_score integer;

CREATE INDEX IF NOT EXISTS picks_league_id_idx ON public.picks (league_id);
CREATE INDEX IF NOT EXISTS picks_home_team_id_idx ON public.picks (home_team_id);
CREATE INDEX IF NOT EXISTS picks_away_team_id_idx ON public.picks (away_team_id);

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_distinct_teams;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_distinct_teams
  CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id);

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_real_scores_valid;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_real_scores_valid
  CHECK (
    (home_score IS NULL AND away_score IS NULL)
    OR (
      home_score IS NOT NULL AND away_score IS NOT NULL
      AND home_score >= 0 AND away_score >= 0
    )
  );

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_probabilities_range;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_probabilities_range
  CHECK (
    (prob_home IS NULL OR prob_home BETWEEN 0 AND 100)
    AND (prob_draw IS NULL OR prob_draw BETWEEN 0 AND 100)
    AND (prob_away IS NULL OR prob_away BETWEEN 0 AND 100)
  ) NOT VALID;

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_probabilities_total;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_probabilities_total
  CHECK (
    (prob_home IS NULL AND prob_draw IS NULL AND prob_away IS NULL)
    OR (
      prob_home IS NOT NULL AND prob_draw IS NULL AND prob_away IS NOT NULL
      AND prob_home + prob_away = 100
    )
    OR (
      prob_home IS NOT NULL AND prob_draw IS NOT NULL AND prob_away IS NOT NULL
      AND prob_home + prob_draw + prob_away = 100
    )
  ) NOT VALID;

COMMENT ON COLUMN public.picks.league_id IS 'Canonical league reference; legacy picks.league remains temporarily.';
COMMENT ON COLUMN public.picks.home_team_id IS 'Canonical home team reference; legacy picks.teams remains temporarily.';
COMMENT ON COLUMN public.picks.away_team_id IS 'Canonical away team reference; legacy picks.teams remains temporarily.';
COMMENT ON COLUMN public.picks.home_score IS 'Actual match home score, not a model projection.';
COMMENT ON COLUMN public.picks.away_score IS 'Actual match away score, not a model projection.';
