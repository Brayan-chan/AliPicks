-- AliPicks atomic structured-pick writes.
-- Centralizes catalog validation + picks + four predictions in one PostgreSQL transaction.

-- -----------------------------------------------------------------------------
-- Database-level catalog integrity.
-- A pick's league, home team and away team must share the sport and both teams
-- must be active members of the selected league.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_pick_catalog_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  league_sport public.sport;
  home_sport public.sport;
  away_sport public.sport;
BEGIN
  -- Keep nullable refs available during the legacy migration window.
  IF NEW.league_id IS NULL AND NEW.home_team_id IS NULL AND NEW.away_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.league_id IS NULL OR NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL THEN
    RAISE EXCEPTION 'league_id, home_team_id and away_team_id must be supplied together';
  END IF;

  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'home and away teams must be different';
  END IF;

  SELECT sport INTO league_sport FROM public.leagues WHERE id = NEW.league_id;
  SELECT sport INTO home_sport FROM public.teams WHERE id = NEW.home_team_id;
  SELECT sport INTO away_sport FROM public.teams WHERE id = NEW.away_team_id;

  IF league_sport IS NULL OR home_sport IS NULL OR away_sport IS NULL THEN
    RAISE EXCEPTION 'invalid league/team reference';
  END IF;

  IF league_sport <> NEW.sport OR home_sport <> NEW.sport OR away_sport <> NEW.sport THEN
    RAISE EXCEPTION 'league and teams must belong to the pick sport';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.league_teams
    WHERE league_id = NEW.league_id AND team_id = NEW.home_team_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'home team is not an active member of the selected league';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.league_teams
    WHERE league_id = NEW.league_id AND team_id = NEW.away_team_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'away team is not an active member of the selected league';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_validate_catalog_refs ON public.picks;
CREATE TRIGGER picks_validate_catalog_refs
BEFORE INSERT OR UPDATE OF sport, league_id, home_team_id, away_team_id
ON public.picks
FOR EACH ROW
EXECUTE FUNCTION public.validate_pick_catalog_refs();

-- -----------------------------------------------------------------------------
-- Atomic editor RPC.
-- p_pick contains both the new canonical fields and the temporary legacy mirrors.
-- p_predictions must contain exactly one of each prediction kind.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_structured_pick(
  p_pick jsonb,
  p_predictions jsonb,
  p_pick_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick_id uuid;
  v_league_name text;
  v_home_name text;
  v_away_name text;
  v_prediction jsonb;
  v_kinds text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_predictions) <> 'array' OR jsonb_array_length(p_predictions) <> 4 THEN
    RAISE EXCEPTION 'exactly four structured predictions are required';
  END IF;

  SELECT array_agg(value->>'kind' ORDER BY value->>'kind')
  INTO v_kinds
  FROM jsonb_array_elements(p_predictions);

  IF v_kinds <> ARRAY['alt_score','primary','primary_score','secondary']::text[] THEN
    RAISE EXCEPTION 'prediction kinds must be primary, secondary, primary_score and alt_score exactly once';
  END IF;

  SELECT name INTO v_league_name
  FROM public.leagues
  WHERE id = (p_pick->>'league_id')::uuid;

  SELECT name INTO v_home_name
  FROM public.teams
  WHERE id = (p_pick->>'home_team_id')::uuid;

  SELECT name INTO v_away_name
  FROM public.teams
  WHERE id = (p_pick->>'away_team_id')::uuid;

  IF v_league_name IS NULL OR v_home_name IS NULL OR v_away_name IS NULL THEN
    RAISE EXCEPTION 'selected league/team could not be resolved';
  END IF;

  IF p_pick_id IS NULL THEN
    INSERT INTO public.picks (
      sport, league, teams, event_at, pick_type, selection, risk,
      prob_home, prob_draw, prob_away, confidence, short_description,
      basic_analysis, status, visibility, price_cents, min_plan_tier, tags,
      featured, is_published, odds, league_id, home_team_id, away_team_id,
      home_score, away_score, event_state, secondary_selection,
      secondary_pick_type, secondary_risk, secondary_confidence, secondary_odds,
      score_primary, score_primary_confidence, score_secondary,
      score_secondary_confidence, recommended, published_at, final_result, factors
    ) VALUES (
      (p_pick->>'sport')::public.sport,
      v_league_name,
      v_home_name || ' vs ' || v_away_name,
      (p_pick->>'event_at')::timestamptz,
      (p_pick->>'pick_type')::public.pick_type,
      p_pick->>'selection',
      (p_pick->>'risk')::public.risk_level,
      NULLIF(p_pick->>'prob_home','')::integer,
      NULLIF(p_pick->>'prob_draw','')::integer,
      NULLIF(p_pick->>'prob_away','')::integer,
      (p_pick->>'confidence')::integer,
      p_pick->>'short_description',
      NULLIF(p_pick->>'basic_analysis',''),
      (p_pick->>'status')::public.pick_status,
      (p_pick->>'visibility')::public.visibility,
      (p_pick->>'price_cents')::integer,
      (p_pick->>'min_plan_tier')::integer,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_pick->'tags','[]'::jsonb))), '{}'::text[]),
      COALESCE((p_pick->>'featured')::boolean, false),
      COALESCE((p_pick->>'is_published')::boolean, false),
      NULLIF(p_pick->>'odds','')::numeric,
      (p_pick->>'league_id')::uuid,
      (p_pick->>'home_team_id')::uuid,
      (p_pick->>'away_team_id')::uuid,
      NULLIF(p_pick->>'home_score','')::integer,
      NULLIF(p_pick->>'away_score','')::integer,
      COALESCE(NULLIF(p_pick->>'event_state',''), 'upcoming'),
      NULLIF(p_pick->>'secondary_selection',''),
      NULLIF(p_pick->>'secondary_pick_type','')::public.pick_type,
      NULLIF(p_pick->>'secondary_risk','')::public.risk_level,
      NULLIF(p_pick->>'secondary_confidence','')::integer,
      NULLIF(p_pick->>'secondary_odds','')::numeric,
      NULLIF(p_pick->>'score_primary',''),
      NULLIF(p_pick->>'score_primary_confidence','')::integer,
      NULLIF(p_pick->>'score_secondary',''),
      NULLIF(p_pick->>'score_secondary_confidence','')::integer,
      COALESCE((p_pick->>'recommended')::boolean, false),
      NULLIF(p_pick->>'published_at','')::timestamptz,
      NULLIF(p_pick->>'final_result',''),
      COALESCE(p_pick->'factors', '[]'::jsonb)
    )
    RETURNING id INTO v_pick_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.picks WHERE id = p_pick_id) THEN
      RAISE EXCEPTION 'pick not found';
    END IF;

    UPDATE public.picks SET
      sport = (p_pick->>'sport')::public.sport,
      league = v_league_name,
      teams = v_home_name || ' vs ' || v_away_name,
      event_at = (p_pick->>'event_at')::timestamptz,
      pick_type = (p_pick->>'pick_type')::public.pick_type,
      selection = p_pick->>'selection',
      risk = (p_pick->>'risk')::public.risk_level,
      prob_home = NULLIF(p_pick->>'prob_home','')::integer,
      prob_draw = NULLIF(p_pick->>'prob_draw','')::integer,
      prob_away = NULLIF(p_pick->>'prob_away','')::integer,
      confidence = (p_pick->>'confidence')::integer,
      short_description = p_pick->>'short_description',
      basic_analysis = NULLIF(p_pick->>'basic_analysis',''),
      status = (p_pick->>'status')::public.pick_status,
      visibility = (p_pick->>'visibility')::public.visibility,
      price_cents = (p_pick->>'price_cents')::integer,
      min_plan_tier = (p_pick->>'min_plan_tier')::integer,
      tags = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_pick->'tags','[]'::jsonb))), '{}'::text[]),
      featured = COALESCE((p_pick->>'featured')::boolean, false),
      is_published = COALESCE((p_pick->>'is_published')::boolean, false),
      odds = NULLIF(p_pick->>'odds','')::numeric,
      league_id = (p_pick->>'league_id')::uuid,
      home_team_id = (p_pick->>'home_team_id')::uuid,
      away_team_id = (p_pick->>'away_team_id')::uuid,
      home_score = NULLIF(p_pick->>'home_score','')::integer,
      away_score = NULLIF(p_pick->>'away_score','')::integer,
      event_state = COALESCE(NULLIF(p_pick->>'event_state',''), 'upcoming'),
      secondary_selection = NULLIF(p_pick->>'secondary_selection',''),
      secondary_pick_type = NULLIF(p_pick->>'secondary_pick_type','')::public.pick_type,
      secondary_risk = NULLIF(p_pick->>'secondary_risk','')::public.risk_level,
      secondary_confidence = NULLIF(p_pick->>'secondary_confidence','')::integer,
      secondary_odds = NULLIF(p_pick->>'secondary_odds','')::numeric,
      score_primary = NULLIF(p_pick->>'score_primary',''),
      score_primary_confidence = NULLIF(p_pick->>'score_primary_confidence','')::integer,
      score_secondary = NULLIF(p_pick->>'score_secondary',''),
      score_secondary_confidence = NULLIF(p_pick->>'score_secondary_confidence','')::integer,
      recommended = COALESCE((p_pick->>'recommended')::boolean, false),
      published_at = NULLIF(p_pick->>'published_at','')::timestamptz,
      final_result = NULLIF(p_pick->>'final_result',''),
      factors = COALESCE(p_pick->'factors', '[]'::jsonb),
      updated_at = now()
    WHERE id = p_pick_id;

    v_pick_id := p_pick_id;
  END IF;

  FOR v_prediction IN SELECT value FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO public.pick_predictions (
      pick_id, kind, market_type, selection, line,
      predicted_home_score, predicted_away_score,
      confidence, risk, odds, result
    ) VALUES (
      v_pick_id,
      (v_prediction->>'kind')::public.prediction_kind,
      NULLIF(v_prediction->>'market_type','')::public.pick_type,
      NULLIF(v_prediction->>'selection',''),
      NULLIF(v_prediction->>'line','')::numeric,
      NULLIF(v_prediction->>'predicted_home_score','')::integer,
      NULLIF(v_prediction->>'predicted_away_score','')::integer,
      (v_prediction->>'confidence')::integer,
      NULLIF(v_prediction->>'risk','')::public.risk_level,
      NULLIF(v_prediction->>'odds','')::numeric,
      (v_prediction->>'result')::public.pick_status
    )
    ON CONFLICT (pick_id, kind) DO UPDATE SET
      market_type = EXCLUDED.market_type,
      selection = EXCLUDED.selection,
      line = EXCLUDED.line,
      predicted_home_score = EXCLUDED.predicted_home_score,
      predicted_away_score = EXCLUDED.predicted_away_score,
      confidence = EXCLUDED.confidence,
      risk = EXCLUDED.risk,
      odds = EXCLUDED.odds,
      result = EXCLUDED.result,
      updated_at = now();
  END LOOP;

  RETURN v_pick_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_structured_pick(jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_structured_pick(jsonb, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.save_structured_pick(jsonb, jsonb, uuid) IS
  'Admin-only atomic write used by the structured Pick Editor. Saves the event and exactly four predictions in one transaction.';
