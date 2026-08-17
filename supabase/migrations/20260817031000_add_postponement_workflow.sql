-- AliPicks postponement / rescheduling workflow.
-- A postponed event keeps its original event_at. If a new date is known it lives in
-- rescheduled_for until the admin reactivates the match as upcoming.

ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS postponement_reason text,
  ADD COLUMN IF NOT EXISTS postponed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_for timestamptz;

CREATE OR REPLACE FUNCTION public.validate_pick_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.event_state NOT IN ('upcoming', 'live', 'finished', 'cancelled', 'postponed') THEN
    RAISE EXCEPTION 'invalid event_state: %', NEW.event_state;
  END IF;

  IF (NEW.home_score IS NULL) <> (NEW.away_score IS NULL) THEN
    RAISE EXCEPTION 'home_score and away_score must be supplied together';
  END IF;

  IF NEW.home_score IS NOT NULL AND (NEW.home_score < 0 OR NEW.away_score < 0) THEN
    RAISE EXCEPTION 'match scores cannot be negative';
  END IF;

  IF NEW.event_state = 'finished' THEN
    IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN
      RAISE EXCEPTION 'finished match requires a complete final score';
    END IF;
    IF NEW.final_result IS NULL OR btrim(NEW.final_result) = '' THEN
      RAISE EXCEPTION 'finished match requires final_result';
    END IF;
  ELSIF NEW.final_result IS NOT NULL AND btrim(NEW.final_result) <> '' THEN
    RAISE EXCEPTION 'final_result is only allowed for finished matches';
  END IF;

  IF NEW.event_state = 'cancelled' AND (NEW.home_score IS NOT NULL OR NEW.away_score IS NOT NULL) THEN
    RAISE EXCEPTION 'cancelled match cannot have a score';
  END IF;

  IF NEW.event_state = 'postponed' THEN
    IF NEW.postponed_at IS NULL THEN
      RAISE EXCEPTION 'postponed match requires postponed_at';
    END IF;
  ELSE
    IF NEW.postponement_reason IS NOT NULL OR NEW.postponed_at IS NOT NULL OR NEW.rescheduled_for IS NOT NULL THEN
      RAISE EXCEPTION 'postponement metadata is only allowed while event_state is postponed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_validate_lifecycle ON public.picks;
CREATE TRIGGER picks_validate_lifecycle
BEFORE INSERT OR UPDATE OF event_state, home_score, away_score, final_result,
  postponement_reason, postponed_at, rescheduled_for
ON public.picks
FOR EACH ROW
EXECUTE FUNCTION public.validate_pick_lifecycle();

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
  v_event_state text;
  v_home_score integer;
  v_away_score integer;
  v_result text;
  v_kind text;
  v_pending_count integer;
  v_non_pending_count integer;
  v_non_void_count integer;
  v_score_non_pending_count integer;
  v_postponement_reason text;
  v_postponed_at timestamptz;
  v_rescheduled_for timestamptz;
  v_old_state text;
  v_old_event_at timestamptz;
  v_old_rescheduled_for timestamptz;
  v_old_reason text;
  v_edit_log jsonb := '[]'::jsonb;
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

  v_event_state := COALESCE(NULLIF(p_pick->>'event_state', ''), 'upcoming');
  IF v_event_state NOT IN ('upcoming', 'live', 'finished', 'cancelled', 'postponed') THEN
    RAISE EXCEPTION 'invalid event_state: %', v_event_state;
  END IF;

  v_home_score := NULLIF(p_pick->>'home_score', '')::integer;
  v_away_score := NULLIF(p_pick->>'away_score', '')::integer;

  IF (v_home_score IS NULL) <> (v_away_score IS NULL) THEN
    RAISE EXCEPTION 'home_score and away_score must be supplied together';
  END IF;
  IF v_home_score IS NOT NULL AND (v_home_score < 0 OR v_away_score < 0) THEN
    RAISE EXCEPTION 'match scores cannot be negative';
  END IF;

  IF v_event_state = 'postponed' THEN
    v_postponement_reason := NULLIF(btrim(p_pick->>'postponement_reason'), '');
    v_postponed_at := COALESCE(NULLIF(p_pick->>'postponed_at', '')::timestamptz, now());
    v_rescheduled_for := NULLIF(p_pick->>'rescheduled_for', '')::timestamptz;
  ELSE
    v_postponement_reason := NULL;
    v_postponed_at := NULL;
    v_rescheduled_for := NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE value->>'result' = 'pending'),
    count(*) FILTER (WHERE value->>'result' <> 'pending'),
    count(*) FILTER (WHERE value->>'result' <> 'void'),
    count(*) FILTER (WHERE value->>'kind' IN ('primary_score','alt_score') AND value->>'result' <> 'pending')
  INTO v_pending_count, v_non_pending_count, v_non_void_count, v_score_non_pending_count
  FROM jsonb_array_elements(p_predictions);

  IF v_event_state = 'finished' THEN
    IF v_home_score IS NULL OR v_away_score IS NULL THEN
      RAISE EXCEPTION 'finished match requires a complete final score';
    END IF;
    IF v_pending_count > 0 THEN
      RAISE EXCEPTION 'finished match requires all four predictions to be resolved';
    END IF;
  ELSIF v_event_state = 'cancelled' THEN
    IF v_home_score IS NOT NULL OR v_away_score IS NOT NULL THEN
      RAISE EXCEPTION 'cancelled match cannot have a score';
    END IF;
    IF v_non_void_count > 0 THEN
      RAISE EXCEPTION 'cancelled match requires all four predictions to be void';
    END IF;
  ELSIF v_event_state IN ('upcoming', 'postponed') THEN
    IF v_non_pending_count > 0 THEN
      RAISE EXCEPTION '% match requires all four predictions to remain pending', v_event_state;
    END IF;
  ELSIF v_event_state = 'live' AND v_score_non_pending_count > 0 THEN
    RAISE EXCEPTION 'exact score predictions cannot be resolved before the match is finished';
  END IF;

  FOR v_prediction IN SELECT value FROM jsonb_array_elements(p_predictions)
  LOOP
    v_kind := v_prediction->>'kind';
    v_result := v_prediction->>'result';

    IF v_result NOT IN ('pending', 'won', 'lost', 'void') THEN
      RAISE EXCEPTION 'invalid prediction result: %', v_result;
    END IF;

    IF v_kind IN ('primary_score', 'alt_score') THEN
      IF NULLIF(v_prediction->>'risk', '') IS NOT NULL OR NULLIF(v_prediction->>'odds', '') IS NOT NULL THEN
        RAISE EXCEPTION 'exact score predictions cannot include risk or odds';
      END IF;
      IF NULLIF(v_prediction->>'predicted_home_score', '') IS NULL
         OR NULLIF(v_prediction->>'predicted_away_score', '') IS NULL THEN
        RAISE EXCEPTION 'exact score predictions require both projected scores';
      END IF;
    END IF;
  END LOOP;

  SELECT name INTO v_league_name FROM public.leagues WHERE id = (p_pick->>'league_id')::uuid;
  SELECT name INTO v_home_name FROM public.teams WHERE id = (p_pick->>'home_team_id')::uuid;
  SELECT name INTO v_away_name FROM public.teams WHERE id = (p_pick->>'away_team_id')::uuid;

  IF v_league_name IS NULL OR v_home_name IS NULL OR v_away_name IS NULL THEN
    RAISE EXCEPTION 'selected league/team could not be resolved';
  END IF;

  IF p_pick_id IS NULL THEN
    v_edit_log := jsonb_build_array(jsonb_build_object(
      'type', 'created',
      'changed_at', now(),
      'event_state', v_event_state,
      'event_at', p_pick->>'event_at'
    ));

    INSERT INTO public.picks (
      sport, league, teams, event_at, pick_type, selection, risk,
      prob_home, prob_draw, prob_away, confidence, short_description,
      basic_analysis, status, visibility, price_cents, min_plan_tier, tags,
      featured, is_published, odds, league_id, home_team_id, away_team_id,
      home_score, away_score, event_state, secondary_selection,
      secondary_pick_type, secondary_risk, secondary_confidence, secondary_odds,
      score_primary, score_primary_confidence, score_secondary,
      score_secondary_confidence, recommended, published_at, final_result, factors,
      postponement_reason, postponed_at, rescheduled_for, edit_log
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
      v_home_score,
      v_away_score,
      v_event_state,
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
      CASE WHEN v_event_state = 'finished' THEN NULLIF(p_pick->>'final_result','') ELSE NULL END,
      COALESCE(p_pick->'factors', '[]'::jsonb),
      v_postponement_reason,
      v_postponed_at,
      v_rescheduled_for,
      v_edit_log
    ) RETURNING id INTO v_pick_id;
  ELSE
    SELECT event_state, event_at, rescheduled_for, postponement_reason, COALESCE(edit_log, '[]'::jsonb)
    INTO v_old_state, v_old_event_at, v_old_rescheduled_for, v_old_reason, v_edit_log
    FROM public.picks
    WHERE id = p_pick_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'pick not found';
    END IF;

    IF v_old_state IS DISTINCT FROM v_event_state
       OR v_old_event_at IS DISTINCT FROM (p_pick->>'event_at')::timestamptz
       OR v_old_rescheduled_for IS DISTINCT FROM v_rescheduled_for
       OR v_old_reason IS DISTINCT FROM v_postponement_reason THEN
      v_edit_log := v_edit_log || jsonb_build_array(jsonb_build_object(
        'type', 'event_lifecycle',
        'changed_at', now(),
        'from_state', v_old_state,
        'to_state', v_event_state,
        'from_event_at', v_old_event_at,
        'to_event_at', (p_pick->>'event_at')::timestamptz,
        'postponement_reason', v_postponement_reason,
        'rescheduled_for', v_rescheduled_for
      ));
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
      home_score = v_home_score,
      away_score = v_away_score,
      event_state = v_event_state,
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
      final_result = CASE WHEN v_event_state = 'finished' THEN NULLIF(p_pick->>'final_result','') ELSE NULL END,
      factors = COALESCE(p_pick->'factors', '[]'::jsonb),
      postponement_reason = v_postponement_reason,
      postponed_at = v_postponed_at,
      rescheduled_for = v_rescheduled_for,
      edit_log = v_edit_log,
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
  'Admin-only atomic structured pick write with lifecycle validation, postponement/rescheduling metadata and edit history.';
