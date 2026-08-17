-- AliPicks prediction auditability.
-- Once an event starts (or reaches a terminal state), the model output that users
-- saw must not be editable retroactively. Only settlement/result fields may change.

ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS predictions_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_pick_prediction_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Locks are monotonic: once set, they can never be cleared or replaced.
  IF TG_OP = 'INSERT' THEN
    IF NEW.event_state IN ('live', 'finished', 'cancelled') THEN
      NEW.predictions_locked_at := COALESCE(NEW.predictions_locked_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.predictions_locked_at IS NOT NULL THEN
    NEW.predictions_locked_at := OLD.predictions_locked_at;
    RETURN NEW;
  END IF;

  IF NEW.event_state IN ('live', 'finished', 'cancelled') THEN
    NEW.predictions_locked_at := now();
  ELSE
    NEW.predictions_locked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_set_prediction_lock ON public.picks;
CREATE TRIGGER picks_set_prediction_lock
BEFORE INSERT OR UPDATE OF event_state, predictions_locked_at
ON public.picks
FOR EACH ROW
EXECUTE FUNCTION public.set_pick_prediction_lock();

CREATE OR REPLACE FUNCTION public.guard_locked_prediction_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_locked_at timestamptz;
BEGIN
  SELECT predictions_locked_at
  INTO v_locked_at
  FROM public.picks
  WHERE id = COALESCE(NEW.pick_id, OLD.pick_id);

  IF v_locked_at IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'locked match predictions cannot be deleted';
  END IF;

  -- After lock, only result settlement is mutable. The original model output
  -- remains immutable for trustworthy historical accuracy metrics.
  IF NEW.pick_id IS DISTINCT FROM OLD.pick_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.market_type IS DISTINCT FROM OLD.market_type
     OR NEW.selection IS DISTINCT FROM OLD.selection
     OR NEW.line IS DISTINCT FROM OLD.line
     OR NEW.predicted_home_score IS DISTINCT FROM OLD.predicted_home_score
     OR NEW.predicted_away_score IS DISTINCT FROM OLD.predicted_away_score
     OR NEW.confidence IS DISTINCT FROM OLD.confidence
     OR NEW.risk IS DISTINCT FROM OLD.risk
     OR NEW.odds IS DISTINCT FROM OLD.odds THEN
    RAISE EXCEPTION 'prediction definition is locked after match start';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pick_predictions_guard_locked_definition ON public.pick_predictions;
CREATE TRIGGER pick_predictions_guard_locked_definition
BEFORE UPDATE OR DELETE
ON public.pick_predictions
FOR EACH ROW
EXECUTE FUNCTION public.guard_locked_prediction_definition();

CREATE OR REPLACE FUNCTION public.guard_locked_pick_legacy_prediction_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Use OLD lock state intentionally. This allows the final pre-match definition
  -- to be saved in the same transaction that first moves an upcoming event to live,
  -- then freezes it for every subsequent edit.
  IF OLD.predictions_locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.pick_type IS DISTINCT FROM OLD.pick_type
     OR NEW.selection IS DISTINCT FROM OLD.selection
     OR NEW.risk IS DISTINCT FROM OLD.risk
     OR NEW.confidence IS DISTINCT FROM OLD.confidence
     OR NEW.odds IS DISTINCT FROM OLD.odds
     OR NEW.secondary_selection IS DISTINCT FROM OLD.secondary_selection
     OR NEW.secondary_pick_type IS DISTINCT FROM OLD.secondary_pick_type
     OR NEW.secondary_risk IS DISTINCT FROM OLD.secondary_risk
     OR NEW.secondary_confidence IS DISTINCT FROM OLD.secondary_confidence
     OR NEW.secondary_odds IS DISTINCT FROM OLD.secondary_odds
     OR NEW.score_primary IS DISTINCT FROM OLD.score_primary
     OR NEW.score_primary_confidence IS DISTINCT FROM OLD.score_primary_confidence
     OR NEW.score_secondary IS DISTINCT FROM OLD.score_secondary
     OR NEW.score_secondary_confidence IS DISTINCT FROM OLD.score_secondary_confidence THEN
    RAISE EXCEPTION 'legacy prediction definition is locked after match start';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_guard_locked_prediction_fields ON public.picks;
CREATE TRIGGER picks_guard_locked_prediction_fields
BEFORE UPDATE OF
  pick_type, selection, risk, confidence, odds,
  secondary_selection, secondary_pick_type, secondary_risk,
  secondary_confidence, secondary_odds,
  score_primary, score_primary_confidence,
  score_secondary, score_secondary_confidence
ON public.picks
FOR EACH ROW
EXECUTE FUNCTION public.guard_locked_pick_legacy_prediction_fields();

COMMENT ON COLUMN public.picks.predictions_locked_at IS
  'Timestamp when model prediction definitions became immutable. Set at first live/finished/cancelled transition and never cleared.';

COMMENT ON FUNCTION public.guard_locked_prediction_definition() IS
  'Allows result settlement but prevents retroactive edits/deletes of structured model predictions after lock.';
