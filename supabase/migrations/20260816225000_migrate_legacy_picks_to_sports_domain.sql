-- AliPicks sports domain - Step 3 (verified)
-- Migrates legacy picks without deleting legacy columns or inventing data.

-- Invalid/partial probability sets become unknown rather than fabricated.
UPDATE public.picks
SET prob_home = NULL, prob_draw = NULL, prob_away = NULL
WHERE NOT (
  (prob_home IS NULL AND prob_draw IS NULL AND prob_away IS NULL)
  OR (
    prob_home IS NOT NULL AND prob_draw IS NULL AND prob_away IS NOT NULL
    AND prob_home BETWEEN 0 AND 100 AND prob_away BETWEEN 0 AND 100
    AND prob_home + prob_away = 100
  )
  OR (
    prob_home IS NOT NULL AND prob_draw IS NOT NULL AND prob_away IS NOT NULL
    AND prob_home BETWEEN 0 AND 100 AND prob_draw BETWEEN 0 AND 100 AND prob_away BETWEEN 0 AND 100
    AND prob_home + prob_draw + prob_away = 100
  )
);

-- Canonical leagues. ON CONFLICT makes this safe if Step 3 is replayed locally.
INSERT INTO public.leagues (sport, name)
SELECT DISTINCT p.sport, trim(p.league)
FROM public.picks p
WHERE trim(coalesce(p.league, '')) <> ''
ON CONFLICT DO NOTHING;

UPDATE public.picks p
SET league_id = l.id
FROM public.leagues l
WHERE p.league_id IS NULL
  AND l.sport = p.sport
  AND lower(trim(l.name)) = lower(trim(p.league))
  AND l.country IS NULL
  AND l.season IS NULL;

-- Parse only exactly one unambiguous "home vs away" matchup.
CREATE TEMP TABLE _alipicks_match_parse ON COMMIT DROP AS
SELECT
  p.id AS pick_id,
  p.sport,
  p.league_id,
  trim(parsed.parts[1]) AS home_name,
  trim(parsed.parts[2]) AS away_name
FROM public.picks p
CROSS JOIN LATERAL (
  SELECT regexp_split_to_array(trim(p.teams), '\s+vs\.?\s+', 'i') AS parts
) parsed
WHERE p.teams IS NOT NULL
  AND cardinality(parsed.parts) = 2
  AND trim(parsed.parts[1]) <> ''
  AND trim(parsed.parts[2]) <> ''
  AND lower(trim(parsed.parts[1])) <> lower(trim(parsed.parts[2]));

INSERT INTO public.teams (sport, name)
SELECT DISTINCT x.sport, x.team_name
FROM (
  SELECT sport, home_name AS team_name FROM _alipicks_match_parse
  UNION
  SELECT sport, away_name AS team_name FROM _alipicks_match_parse
) x
ON CONFLICT DO NOTHING;

INSERT INTO public.league_teams (league_id, team_id)
SELECT DISTINCT mp.league_id, t.id
FROM _alipicks_match_parse mp
JOIN public.teams t
  ON t.sport = mp.sport
 AND (lower(trim(t.name)) = lower(mp.home_name) OR lower(trim(t.name)) = lower(mp.away_name))
WHERE mp.league_id IS NOT NULL
ON CONFLICT (league_id, team_id) DO NOTHING;

UPDATE public.picks p
SET home_team_id = home.id, away_team_id = away.id
FROM _alipicks_match_parse mp
JOIN public.teams home
  ON home.sport = mp.sport AND lower(trim(home.name)) = lower(mp.home_name)
JOIN public.teams away
  ON away.sport = mp.sport AND lower(trim(away.name)) = lower(mp.away_name)
WHERE p.id = mp.pick_id;

DO $$
DECLARE unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM _alipicks_match_parse mp
  JOIN public.picks p ON p.id = mp.pick_id
  WHERE p.league_id IS NULL OR p.home_team_id IS NULL OR p.away_team_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'AliPicks migration stopped: % parseable matchup(s) could not be linked.', unresolved_count;
  END IF;
END
$$;

-- Primary prediction. Legacy global status maps only to the historical primary pick.
INSERT INTO public.pick_predictions
  (pick_id, kind, market_type, selection, confidence, risk, odds, result)
SELECT
  p.id, 'primary'::public.prediction_kind, p.pick_type, trim(p.selection),
  p.confidence, p.risk, p.odds, p.status
FROM public.picks p
WHERE trim(coalesce(p.selection, '')) <> ''
  AND p.pick_type IS NOT NULL
  AND p.confidence BETWEEN 1 AND 100
  AND p.risk IS NOT NULL
  AND p.odds IS NOT NULL AND p.odds > 1
ON CONFLICT (pick_id, kind) DO NOTHING;

-- Secondary prediction. No historical independent settlement exists, so it stays pending.
INSERT INTO public.pick_predictions
  (pick_id, kind, market_type, selection, confidence, risk, odds, result)
SELECT
  p.id, 'secondary'::public.prediction_kind, p.secondary_pick_type,
  trim(p.secondary_selection), p.secondary_confidence, p.secondary_risk,
  p.secondary_odds, 'pending'::public.pick_status
FROM public.picks p
WHERE trim(coalesce(p.secondary_selection, '')) <> ''
  AND p.secondary_pick_type IS NOT NULL
  AND p.secondary_confidence BETWEEN 1 AND 100
  AND p.secondary_risk IS NOT NULL
  AND p.secondary_odds IS NOT NULL AND p.secondary_odds > 1
ON CONFLICT (pick_id, kind) DO NOTHING;

-- Primary score: confidence only, intentionally no risk/odds.
INSERT INTO public.pick_predictions
  (pick_id, kind, predicted_home_score, predicted_away_score, confidence, result)
SELECT
  p.id, 'primary_score'::public.prediction_kind,
  (m.capture)[1]::integer, (m.capture)[2]::integer,
  p.score_primary_confidence, 'pending'::public.pick_status
FROM public.picks p
CROSS JOIN LATERAL (
  SELECT regexp_match(trim(coalesce(p.score_primary, '')), '^\s*([0-9]+)\s*[-:]\s*([0-9]+)\s*$') AS capture
) m
WHERE m.capture IS NOT NULL
  AND p.score_primary_confidence BETWEEN 1 AND 100
ON CONFLICT (pick_id, kind) DO NOTHING;

-- Alt score: legacy score_secondary; confidence only, intentionally no risk/odds.
INSERT INTO public.pick_predictions
  (pick_id, kind, predicted_home_score, predicted_away_score, confidence, result)
SELECT
  p.id, 'alt_score'::public.prediction_kind,
  (m.capture)[1]::integer, (m.capture)[2]::integer,
  p.score_secondary_confidence, 'pending'::public.pick_status
FROM public.picks p
CROSS JOIN LATERAL (
  SELECT regexp_match(trim(coalesce(p.score_secondary, '')), '^\s*([0-9]+)\s*[-:]\s*([0-9]+)\s*$') AS capture
) m
WHERE m.capture IS NOT NULL
  AND p.score_secondary_confidence BETWEEN 1 AND 100
ON CONFLICT (pick_id, kind) DO NOTHING;

ALTER TABLE public.picks VALIDATE CONSTRAINT picks_probabilities_range;
ALTER TABLE public.picks VALIDATE CONSTRAINT picks_probabilities_total;

COMMENT ON COLUMN public.picks.teams IS 'LEGACY: retained temporarily; new code should prefer home_team_id/away_team_id.';
COMMENT ON COLUMN public.picks.league IS 'LEGACY: retained temporarily; new code should prefer league_id.';
