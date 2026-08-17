-- AliPicks match state transition guard.
-- Prevents historical results from being reopened accidentally while still allowing
-- the operational paths needed by the admin panel.

CREATE OR REPLACE FUNCTION public.guard_pick_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.event_state IS NOT DISTINCT FROM OLD.event_state THEN
    RETURN NEW;
  END IF;

  -- Terminal states stay terminal. Corrections to score/result can still be made
  -- while keeping the same state, but the event cannot be reopened as upcoming/live.
  IF OLD.event_state = 'finished' THEN
    RAISE EXCEPTION 'finished match cannot transition to another state';
  END IF;

  IF OLD.event_state = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled match cannot transition to another state';
  END IF;

  IF OLD.event_state = 'upcoming' THEN
    IF NEW.event_state NOT IN ('live', 'finished', 'cancelled', 'postponed') THEN
      RAISE EXCEPTION 'invalid transition from upcoming to %', NEW.event_state;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.event_state = 'live' THEN
    -- A live event may finish normally, be cancelled/abandoned, or be suspended
    -- and represented as postponed until a new continuation date is known.
    IF NEW.event_state NOT IN ('finished', 'cancelled', 'postponed') THEN
      RAISE EXCEPTION 'invalid transition from live to %', NEW.event_state;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.event_state = 'postponed' THEN
    -- Reprogrammed matches return to upcoming. They may also be cancelled while
    -- waiting for a new date.
    IF NEW.event_state NOT IN ('upcoming', 'cancelled') THEN
      RAISE EXCEPTION 'invalid transition from postponed to %', NEW.event_state;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid match lifecycle transition from % to %', OLD.event_state, NEW.event_state;
END;
$$;

DROP TRIGGER IF EXISTS picks_guard_state_transition ON public.picks;
CREATE TRIGGER picks_guard_state_transition
BEFORE UPDATE OF event_state
ON public.picks
FOR EACH ROW
EXECUTE FUNCTION public.guard_pick_state_transition();

COMMENT ON FUNCTION public.guard_pick_state_transition() IS
  'Enforces AliPicks match lifecycle transitions and prevents terminal events from being reopened.';
