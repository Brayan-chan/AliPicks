-- AliPicks prediction lifecycle hardening.
-- Protects prediction result consistency even when writes bypass the admin UI.

CREATE OR REPLACE FUNCTION public.validate_pick_prediction_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_event_state text;
  v_home_score integer;
  v_away_score integer;
  v_expected_result public.pick_status;
BEGIN
  SELECT event_state, home_score, away_score
  INTO v_event_state, v_home_score, v_away_score
  FROM public.picks
  WHERE id = NEW.pick_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prediction references an unknown pick';
  END IF;

  -- No prediction can be settled before the event has a terminal state.
  IF v_event_state IN ('upcoming', 'live', 'postponed') AND NEW.result <> 'pending' THEN
    RAISE EXCEPTION '% match predictions must remain pending', v_event_state;
  END IF;

  -- Cancellation voids the full model output, including exact-score projections.
  IF v_event_state = 'cancelled' AND NEW.result <> 'void' THEN
    RAISE EXCEPTION 'cancelled match predictions must be void';
  END IF;

  IF NEW.kind IN ('primary_score', 'alt_score') THEN
    -- Exact-score projections are analytical outputs, not betting recommendations.
    IF NEW.risk IS NOT NULL OR NEW.odds IS NOT NULL THEN
      RAISE EXCEPTION 'exact score predictions cannot include risk or odds';
    END IF;

    IF NEW.predicted_home_score IS NULL OR NEW.predicted_away_score IS NULL THEN
      RAISE EXCEPTION 'exact score predictions require both projected scores';
    END IF;

    IF NEW.predicted_home_score < 0 OR NEW.predicted_away_score < 0 THEN
      RAISE EXCEPTION 'projected scores cannot be negative';
    END IF;

    -- Once a match is finished, exact-score outcomes are deterministic and must
    -- match the stored final score. This prevents an admin/client bug from marking
    -- an incorrect exact-score projection as won.
    IF v_event_state = 'finished' THEN
      IF v_home_score IS NULL OR v_away_score IS NULL THEN
        RAISE EXCEPTION 'finished match requires a complete final score before resolving score predictions';
      END IF;

      v_expected_result := CASE
        WHEN NEW.predicted_home_score = v_home_score
         AND NEW.predicted_away_score = v_away_score
          THEN 'won'::public.pick_status
        ELSE 'lost'::public.pick_status
      END;

      IF NEW.result <> v_expected_result THEN
        RAISE EXCEPTION 'exact score result must be % for final score %-%',
          v_expected_result, v_home_score, v_away_score;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pick_predictions_validate_lifecycle ON public.pick_predictions;
CREATE TRIGGER pick_predictions_validate_lifecycle
BEFORE INSERT OR UPDATE OF pick_id, kind, predicted_home_score, predicted_away_score, risk, odds, result
ON public.pick_predictions
FOR EACH ROW
EXECUTE FUNCTION public.validate_pick_prediction_lifecycle();

COMMENT ON FUNCTION public.validate_pick_prediction_lifecycle() IS
  'Enforces pending/void result lifecycle and deterministic exact-score settlement against the match final score.';
