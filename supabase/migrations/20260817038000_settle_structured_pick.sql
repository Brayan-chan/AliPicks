-- AliPicks dedicated settlement path.
-- Separates immutable prediction definitions from post-match resolution so closing
-- a match never needs to rewrite the model output that users originally saw.

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_event_state NOT IN ('finished', 'cancelled') THEN
    RAISE EXCEPTION 'settlement state must be finished or cancelled';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.picks WHERE id = p_pick_id) THEN
    RAISE EXCEPTION 'pick not found';
  END IF;

  -- Lock the pick row so concurrent settlement attempts cannot race.
  PERFORM 1
  FROM public.picks
  WHERE id = p_pick_id
  FOR UPDATE;

  IF p_event_state = 'cancelled' THEN
    IF p_home_score IS NOT NULL OR p_away_score IS NOT NULL THEN
      RAISE EXCEPTION 'cancelled match cannot have a score';
    END IF;

    UPDATE public.picks
    SET event_state = 'cancelled',
        home_score = NULL,
        away_score = NULL,
        final_result = NULL,
        status = 'void',
        postponement_reason = NULL,
        postponed_at = NULL,
        rescheduled_for = NULL,
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

  -- Update the match first. This sets predictions_locked_at if it was not already
  -- set. Subsequent prediction updates only touch result, which is explicitly
  -- allowed by the immutable-definition trigger.
  UPDATE public.picks
  SET event_state = 'finished',
      home_score = p_home_score,
      away_score = p_away_score,
      final_result = p_home_score::text || '-' || p_away_score::text,
      status = p_primary_result,
      postponement_reason = NULL,
      postponed_at = NULL,
      rescheduled_for = NULL,
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
  'Admin-only settlement RPC. Resolves results and final score without rewriting locked prediction definitions.';
