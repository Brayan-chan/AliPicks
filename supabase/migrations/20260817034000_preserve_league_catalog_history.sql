-- AliPicks league catalog history protection.
-- Once a league participates in team membership history or structured picks,
-- its identity must remain stable. Admins should deactivate it instead of deleting
-- or changing its sport.

CREATE OR REPLACE FUNCTION public.guard_league_catalog_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sport IS DISTINCT FROM OLD.sport THEN
    IF EXISTS (
      SELECT 1 FROM public.league_teams lt WHERE lt.league_id = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM public.picks p WHERE p.league_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot change sport for a league with catalog history';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.league_teams lt WHERE lt.league_id = OLD.id
    ) OR EXISTS (
      SELECT 1 FROM public.picks p WHERE p.league_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot delete league with catalog history; deactivate it instead';
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS leagues_guard_catalog_history ON public.leagues;
CREATE TRIGGER leagues_guard_catalog_history
BEFORE UPDATE OF sport OR DELETE
ON public.leagues
FOR EACH ROW
EXECUTE FUNCTION public.guard_league_catalog_history();

COMMENT ON FUNCTION public.guard_league_catalog_history() IS
  'Prevents destructive league sport changes/deletes once team membership or pick history exists.';
