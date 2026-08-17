-- Keep dedicated settlement writes visible in the existing pick lifecycle audit log.

CREATE OR REPLACE FUNCTION public.settle_structured_pick(
  p_pick_id uuid,
  p_event_state text,
  p_home_score integer DEFAULT NULL,
  p_away_score integer DEFAULT NULL,
  p_primary_result public.pick_status DEFAULT NULL,
  p_secondary_result public.pick_status DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_score_result public.pick_status;
  v_alt_score_result public.pick_status;
  v_old_state text;
  v_old_home_score integer;
  v_old_away_score integer;
  v_edit_log jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_event_state NOT IN ('finished', 'cancelled') THEN
    RAISE EXCEPTION 'settlement state must be finished or cancelled';
  END IF;

  SELECT event_state, home_score, away_score, COALESCE(edit_log, '[]'::jsonb)
  INTO v_old_state, v_old_home_score, v_old_away_score, v_edit_log
  FROM public.picks
  WHERE id = p_pick_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pick not found';
  END IF;

  IF p_event_state = 'cancelled' THEN
    IF p_home_score IS NOT NULL OR p_away_score IS NOT NULL THEN
      RAISE EXCEPTION 'cancelled match cannot have a score';
    END IF;

    v_edit_log := v_edit_log || jsonb_build_array(jsonb_build_object(
      'type', 'settlement',
      'changed_at', now(),
      'from_state', v_old_state,
      'to_state', 'cancelled',
      'from_home_score', v_old_home_score,
      'from_away_score', v_old_away_score,
      'to_home_score', NULL,
      'to_away_score', NULL,
      'primary_result', 'void',
      'secondary_result', 'void'
    ));

    UPDATE public.picks
    SET event_state = 'cancelled',
        home_score = NULL,
        away_score = NULL,
        final_result = NULL,
        status = 'void',
        postponement_reason = NULL,
        postponed_at = NULL,
        rescheduled_for = NULL,
        edit_log = v_edit_log,
        updated_at = now()
    WHERE id = p_pick_id;

    UPDATE public.pick_predictions
    SET result = 'void',
        updated_at = now()
    WHERE pick_id = p_pick_id;

    RETURN p_pick_id;
  END IF;

  IF p_home_score IS NULL OR p_away_score IS NULL THEN
    RAISE EXCEPTION 'finished match requires a complete final score';
  END IF;

  IF p_home_score < 0 OR p_away_score < 0 THEN
    RAISE EXCEPTION 'match scores cannot be negative';
  END IF;

  IF p_primary_result NOT IN ('won', 'lost', 'void') THEN
    RAISE EXCEPTION 'primary result must be won, lost or void';
  END IF;

  IF p_secondary_result NOT IN ('won', 'lost', 'void') THEN
    RAISE EXCEPTION 'secondary result must be won, lost or void';
  END IF;

  SELECT CASE
    WHEN predicted_home_score = p_home_score
     AND predicted_away_score = p_away_score
      THEN 'won'::public.pick_status
    ELSE 'lost'::public.pick_status
  END
  INTO v_primary_score_result
  FROM public.pick_predictions
  WHERE pick_id = p_pick_id AND kind = 'primary_score';

  SELECT CASE
    WHEN predicted_home_score = p_home_score
     AND predicted_away_score = p_away_score
      THEN 'won'::public.pick_status
    ELSE 'lost'::public.pick_status
  END
  INTO v_alt_score_result
  FROM public.pick_predictions
  WHERE pick_id = p_pick_id AND kind = 'alt_score';

  IF v_primary_score_result IS NULL OR v_alt_score_result IS NULL THEN
    RAISE EXCEPTION 'structured score predictions are missing';
  END IF;

  v_edit_log := v_edit_log || jsonb_build_array(jsonb_build_object(
    'type', 'settlement',
    'changed_at', now(),
    'from_state', v_old_state,
    'to_state', 'finished',
    'from_home_score', v_old_home_score,
    'from_away_score', v_old_away_score,
    'to_home_score', p_home_score,
    'to_away_score', p_away_score,
    'primary_result', p_primary_result,
    'secondary_result', p_secondary_result,
    'primary_score_result', v_primary_score_result,
    'alt_score_result', v_alt_score_result
  ));

  UPDATE public.picks
  SET event_state = 'finished',
      home_score = p_home_score,
      away_score = p_away_score,
      final_result = p_home_score::text || '-' || p_away_score::text,
      status = p_primary_result,
      postponement_reason = NULL,
      postponed_at = NULL,
      rescheduled_for = NULL,
      edit_log = v_edit_log,
      updated_at = now()
  WHERE id = p_pick_id;

  UPDATE public.pick_predictions
  SET result = CASE kind
        WHEN 'primary' THEN p_primary_result
        WHEN 'secondary' THEN p_secondary_result
        WHEN 'primary_score' THEN v_primary_score_result
        WHEN 'alt_score' THEN v_alt_score_result
        ELSE result
      END,
      updated_at = now()
  WHERE pick_id = p_pick_id;

  RETURN p_pick_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_structured_pick(uuid, text, integer, integer, public.pick_status, public.pick_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_structured_pick(uuid, text, integer, integer, public.pick_status, public.pick_status) TO authenticated;

COMMENT ON FUNCTION public.settle_structured_pick(uuid, text, integer, integer, public.pick_status, public.pick_status) IS
  'Admin-only audited settlement RPC. Resolves final score/results without rewriting locked prediction definitions.';
