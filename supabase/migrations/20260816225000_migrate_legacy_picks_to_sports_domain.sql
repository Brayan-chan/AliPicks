-- AliPicks sports domain - Step 3
-- Migrates current legacy pick data into leagues, teams, league_teams and
-- pick_predictions without removing legacy columns.
--
-- Migration principles:
-- 1. Never invent team identities. Only rows matching "Home vs Away" are split.
-- 2. Non-match legacy rows (for example old multi-event parlays) keep nullable
--    home/away references and can be cleaned up separately.
-- 3. Never invent model confidence or odds. A structured prediction is created
--    only when the legacy row contains the data required by the new schema.
-- 4. Exact-score projections are migrated without risk and without odds when
--    they come from score_primary / score_secondary.

-- -----------------------------------------------------------------------------
-- Normalize malformed probability sets before touching rows.
-- We prefer "unknown" (NULL) over silently inventing percentages.
-- -----------------------------------------------------------------------------
UPDATE public.picks
SET
  prob_home = NULL,
  prob_draw = NULL,
  prob_away = NULL
WHERE NOT (
  (prob_home IS NULL AND prob_draw IS NULL AND prob_away IS NULL)
  OR
  (
    prob_home IS NOT NULL
    AND prob_draw IS NULL
    AND prob_away IS NOT NULL
    AND prob_home + prob_away = 100
  )
  OR
  (
    prob_home IS NOT NULL
    AND prob_draw IS NOT NULL
    AND prob_away IS NOT NULL
    AND prob_home + prob_draw + prob_away = 100
  )
);

-- -----------------------------------------------------------------------------
-- Create canonical leagues from the current legacy league strings.
-- Country/season stay NULL because legacy rows do not contain reliable values.
-- -----------------------------------------------------------------------------
INSERT INTO public.leagues (sport, name)
SELECT DISTINCT p.sport, trim(p.league)
FROM public.picks p
WHERE trim(coalesce(p.league, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.leagues l
    WHERE l.sport = p.sport
      AND lower(trim(l.name)) = lower(trim(p.league))
      AND l.country IS NULL
      AND l.season IS NULL
  );

-- Attach every legacy pick to its canonical league.
UPDATE public.picks p
SET league_id = l.id
FROM public.leagues l
WHERE p.league_id IS NULL
  AND l.sport = p.sport
  AND lower(trim(l.name)) = lower(trim(p.league))
  AND l.country IS NULL
  AND l.season IS NULL;

-- -----------------------------------------------------------------------------
-- Parse only unambiguous "Home vs Away" legacy strings.
-- regexp_split_to_array handles spacing/case variations such as VS / vs / vs.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _alipicks_match_parse ON COMMIT DROP AS
SELECT
  p.id AS pick_id,
  p.sport,
  p.league_id,
  trim(parts[1]) AS home_name,
  trim(parts[2]) AS away_name
FROM public.picks p
CROSS JOIN LATERAL regexp_split_to_array(
  trim(p.teams),
  '\s+vs\.?\s+',
  'i'
) AS parts
WHERE cardinality(parts) = 2
  AND trim(parts[1]) <> ''
  AND trim(parts[2]) <> ''
  AND lower(trim(parts[1])) <> lower(trim(parts[2]));

-- Create canonical teams from parsed matchups.
INSERT INTO public.teams (sport, name)
SELECT DISTINCT x.sport, x.team_name
FROM (
  SELECT sport, home_name AS team_name FROM _alipicks_match_parse
  UNION
  SELECT sport, away_name AS team_name FROM _alipicks_match_parse
) x
WHERE NOT EXISTS (
  SELECT 1
  FROM public.teams t
  WHERE t.sport = x.sport
    AND lower(trim(t.name)) = lower(trim(x.team_name))
);

-- Connect teams to every league in which they appear.
INSERT INTO public.league_teams (league_id, team_id)
SELECT DISTINCT mp.league_id, t.id
FROM _alipicks_match_parse mp
JOIN public.teams t
  ON t.sport = mp.sport
 AND (
   lower(trim(t.name)) = lower(trim(mp.home_name))
   OR lower(trim(t.name)) = lower(trim(mp.away_name))
 )
WHERE mp.league_id IS NOT NULL
ON CONFLICT (league_id, team_id) DO NOTHING;

-- Attach canonical home/away references to picks.
UPDATE public.picks p
SET
  home_team_id = home.id,
  away_team_id = away.id
FROM _alipicks_match_parse mp
JOIN public.teams home
  ON home.sport = mp.sport
 AND lower(trim(home.name)) = lower(trim(mp.home_name))
JOIN public.teams away
  ON away.sport = mp.sport
 AND lower(trim(away.name)) = lower(trim(mp.away_name))
WHERE p.id = mp.pick_id;

-- Safety check: every parseable matchup must now have all canonical references.
DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*)
  INTO unresolved_count
  FROM _alipicks_match_parse mp
  JOIN public.picks p ON p.id = mp.pick_id
  WHERE p.league_id IS NULL
     OR p.home_team_id IS NULL
     OR p.away_team_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'AliPicks sports migration stopped: % parseable matchup(s) could not be linked to canonical league/team records.',
      unresolved_count;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Migrate the legacy PRIMARY prediction.
-- Legacy picks.status historically describes the primary prediction, so it is
-- preserved as the primary structured result.
-- -----------------------------------------------------------------------------
INSERT INTO public.pick_predictions (
  pick_id,
  kind,
  market_type,
  selection,
  confidence,
  risk,
  odds,
  result
)
SELECT
  p.id,
  'primary'::public.prediction_kind,
  p.pick_type,
  trim(p.selection),
  p.confidence,
  p.risk,
  p.odds,
  p.status
FROM public.picks p
WHERE trim(coalesce(p.selection, '')) <> ''
  AND p.confidence BETWEEN 1 AND 100
  AND p.odds IS NOT NULL
  AND p.odds > 1
ON CONFLICT (pick_id, kind) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migrate the legacy SECONDARY prediction.
-- There is no reliable historical secondary settlement result, therefore it
-- remains pending unless the whole event is explicitly cancelled.
-- -----------------------------------------------------------------------------
INSERT INTO public.pick_predictions (
  pick_id,
  kind,
  market_type,
  selection,
  confidence,
  risk,
  odds,
  result
)
SELECT
  p.id,
  'secondary'::public.prediction_kind,
  p.secondary_pick_type,
  trim(p.secondary_selection),
  p.secondary_confidence,
  p.secondary_risk,
  p.secondary_odds,
  CASE
    WHEN p.event_state = 'cancelled' THEN 'void'::public.pick_status
    ELSE 'pending'::public.pick_status
  END
FROM public.picks p
WHERE trim(coalesce(p.secondary_selection, '')) <> ''
  AND p.secondary_pick_type IS NOT NULL
  AND p.secondary_confidence BETWEEN 1 AND 100
  AND p.secondary_risk IS NOT NULL
  AND p.secondary_odds IS NOT NULL
  AND p.secondary_odds > 1
ON CONFLICT (pick_id, kind) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migrate PRIMARY SCORE.
-- Score projections intentionally have confidence only: NO risk and NO odds.
-- -----------------------------------------------------------------------------
INSERT INTO public.pick_predictions (
  pick_id,
  kind,
  predicted_home_score,
  predicted_away_score,
  confidence,
  result
)
SELECT
  p.id,
  'primary_score'::public.prediction_kind,
  (m.capture)[1]::integer,
  (m.capture)[2]::integer,
  p.score_primary_confidence,
  CASE
    WHEN p.event_state = 'cancelled' THEN 'void'::public.pick_status
    ELSE 'pending'::public.pick_status
  END
FROM public.picks p
CROSS JOIN LATERAL (
  SELECT regexp_match(
    trim(coalesce(p.score_primary, '')),
    '^\s*([0-9]+)\s*[-:]\s*([0-9]+)\s*$'
  ) AS capture
) m
WHERE m.capture IS NOT NULL
  AND p.score_primary_confidence BETWEEN 1 AND 100
ON CONFLICT (pick_id, kind) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migrate ALT SCORE (legacy score_secondary).
-- Score projections intentionally have confidence only: NO risk and NO odds.
-- -----------------------------------------------------------------------------
INSERT INTO public.pick_predictions (
  pick_id,
  kind,
  predicted_home_score,
  predicted_away_score,
  confidence,
  result
)
SELECT
  p.id,
  'alt_score'::public.prediction_kind,
  (m.capture)[1]::integer,
  (m.capture)[2]::integer,
  p.score_secondary_confidence,
  CASE
    WHEN p.event_state = 'cancelled' THEN 'void'::public.pick_status
    ELSE 'pending'::public.pick_status
  END
FROM public.picks p
CROSS JOIN LATERAL (
  SELECT regexp_match(
    trim(coalesce(p.score_secondary, '')),
    '^\s*([0-9]+)\s*[-:]\s*([0-9]+)\s*$'
  ) AS capture
) m
WHERE m.capture IS NOT NULL
  AND p.score_secondary_confidence BETWEEN 1 AND 100
ON CONFLICT (pick_id, kind) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Validate the probability rule introduced in Step 2 now that legacy rows have
-- been normalized.
-- -----------------------------------------------------------------------------
ALTER TABLE public.picks
  VALIDATE CONSTRAINT picks_probabilities_total;

-- -----------------------------------------------------------------------------
-- Migration visibility / diagnostics.
-- These comments document intentional nullable references after migration.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.picks.teams IS
  'LEGACY: retained temporarily. Parseable Home vs Away rows are now represented by home_team_id/away_team_id.';

COMMENT ON COLUMN public.picks.league IS
  'LEGACY: retained temporarily. New code should prefer league_id.';
