-- AliPicks team catalog history protection.
-- Once a team participates in league membership history or structured picks,
-- its identity must remain stable. Admins should deactivate it instead of deleting
-- or changing its sport.

CREATE OR REPLACE FUNCTION public.guard_team_catalog_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sport IS DISTINCT FROM OLD.sport THEN
    IF EXISTS (
      SELECT 1 FROM public.league_teams lt WHERE lt.team_id = OLD.id
    ) OR EXISTS (
      SELECT 1
      FROM public.picks p
      WHERE p.home_team_id = OLD.id OR p.away_team_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot change sport for a team with catalog history';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.league_teams lt WHERE lt.team_id = OLD.id
    ) OR EXISTS (
      SELECT 1
      FROM public.picks p
      WHERE p.home_team_id = OLD.id OR p.away_team_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot delete team with catalog history; deactivate it instead';
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS teams_guard_catalog_history ON public.teams;
CREATE TRIGGER teams_guard_catalog_history
BEFORE UPDATE OF sport OR DELETE
ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.guard_team_catalog_history();

-- Keep the atomic RPC aligned with the catalog trigger and provide an early,
-- domain-specific error before attempting the update.
CREATE OR REPLACE FUNCTION public.save_team_catalog(
  p_team jsonb,
  p_league_ids uuid[],
  p_team_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_sport public.sport;
  v_name text;
  v_short_name text;
  v_slug text;
  v_country text;
  v_logo_url text;
  v_is_active boolean;
  v_selected_count integer;
  v_active_selected_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  v_sport := NULLIF(p_team->>'sport', '')::public.sport;
  v_name := NULLIF(btrim(p_team->>'name'), '');
  v_short_name := NULLIF(btrim(p_team->>'short_name'), '');
  v_slug := NULLIF(btrim(p_team->>'slug'), '');
  v_country := NULLIF(btrim(p_team->>'country'), '');
  v_logo_url := NULLIF(btrim(p_team->>'logo_url'), '');
  v_is_active := COALESCE((p_team->>'is_active')::boolean, true);

  IF v_sport IS NULL THEN
    RAISE EXCEPTION 'team sport is required';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'team name is required';
  END IF;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'team slug is required';
  END IF;
  IF p_league_ids IS NULL OR cardinality(p_league_ids) = 0 THEN
    RAISE EXCEPTION 'team must belong to at least one league';
  END IF;
  IF cardinality(p_league_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_league_ids))) THEN
    RAISE EXCEPTION 'duplicate league ids are not allowed';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_active)
  INTO v_selected_count, v_active_selected_count
  FROM public.leagues
  WHERE id = ANY(p_league_ids)
    AND sport = v_sport;

  IF v_selected_count <> cardinality(p_league_ids) THEN
    RAISE EXCEPTION 'all selected leagues must exist and belong to the team sport';
  END IF;
  IF v_is_active AND v_active_selected_count = 0 THEN
    RAISE EXCEPTION 'active team must belong to at least one active league';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
      RAISE EXCEPTION 'team not found';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = p_team_id
        AND t.sport <> v_sport
    ) AND (
      EXISTS (SELECT 1 FROM public.league_teams lt WHERE lt.team_id = p_team_id)
      OR EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.home_team_id = p_team_id OR p.away_team_id = p_team_id
      )
    ) THEN
      RAISE EXCEPTION 'cannot change sport for a team with catalog history';
    END IF;
  END IF;

  IF p_team_id IS NULL THEN
    INSERT INTO public.teams (
      sport, name, short_name, slug, country, logo_url, is_active
    ) VALUES (
      v_sport, v_name, v_short_name, v_slug, v_country, v_logo_url, v_is_active
    )
    RETURNING id INTO v_team_id;
  ELSE
    UPDATE public.teams
    SET sport = v_sport,
        name = v_name,
        short_name = v_short_name,
        slug = v_slug,
        country = v_country,
        logo_url = v_logo_url,
        is_active = v_is_active,
        updated_at = now()
    WHERE id = p_team_id
    RETURNING id INTO v_team_id;
  END IF;

  UPDATE public.league_teams
  SET is_active = false
  WHERE team_id = v_team_id
    AND is_active = true
    AND NOT (league_id = ANY(p_league_ids));

  INSERT INTO public.league_teams (league_id, team_id, is_active)
  SELECT league_id, v_team_id, true
  FROM unnest(p_league_ids) AS league_id
  ON CONFLICT (league_id, team_id)
  DO UPDATE SET is_active = true;

  RETURN v_team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_team_catalog(jsonb, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_team_catalog(jsonb, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.guard_team_catalog_history() IS
  'Prevents destructive team sport changes/deletes once league membership or pick history exists.';
