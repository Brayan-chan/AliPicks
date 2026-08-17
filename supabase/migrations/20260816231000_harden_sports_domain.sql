-- AliPicks sports domain hardening after Step 6 review.
-- Adds catalog slugs required by the admin UI, prevents deleting catalog rows used
-- by picks, and aligns prediction confidence with percentage semantics (0..100).

-- -----------------------------------------------------------------------------
-- Stable slugs for admin/catalog URLs and search.
-- Slugs are unique within a sport, not globally.
-- -----------------------------------------------------------------------------
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS slug text;

-- Generate deterministic slugs for rows created by the legacy migration.
UPDATE public.leagues
SET slug = trim(both '-' from regexp_replace(
  lower(translate(name,
    'áéíóúüñÁÉÍÓÚÜÑ',
    'aeiouunAEIOUUN')),
  '[^a-z0-9]+', '-', 'g'
))
WHERE slug IS NULL OR trim(slug) = '';

UPDATE public.teams
SET slug = trim(both '-' from regexp_replace(
  lower(translate(name,
    'áéíóúüñÁÉÍÓÚÜÑ',
    'aeiouunAEIOUUN')),
  '[^a-z0-9]+', '-', 'g'
))
WHERE slug IS NULL OR trim(slug) = '';

-- Resolve any unlikely same-sport slug collisions without inventing display names.
WITH ranked AS (
  SELECT id, sport, slug,
    row_number() OVER (PARTITION BY sport, slug ORDER BY created_at, id) AS rn
  FROM public.leagues
)
UPDATE public.leagues l
SET slug = l.slug || '-' || ranked.rn
FROM ranked
WHERE l.id = ranked.id AND ranked.rn > 1;

WITH ranked AS (
  SELECT id, sport, slug,
    row_number() OVER (PARTITION BY sport, slug ORDER BY created_at, id) AS rn
  FROM public.teams
)
UPDATE public.teams t
SET slug = t.slug || '-' || ranked.rn
FROM ranked
WHERE t.id = ranked.id AND ranked.rn > 1;

ALTER TABLE public.leagues ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.teams ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_slug_not_blank;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_slug_not_blank CHECK (length(trim(slug)) > 0);
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_slug_not_blank;
ALTER TABLE public.teams ADD CONSTRAINT teams_slug_not_blank CHECK (length(trim(slug)) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS leagues_unique_sport_slug
  ON public.leagues (sport, lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS teams_unique_sport_slug
  ON public.teams (sport, lower(slug));

-- -----------------------------------------------------------------------------
-- Do not silently detach picks when an admin deletes a league/team.
-- Catalog rows referenced by picks must be preserved (or deactivated instead).
-- Constraint names remain stable because frontend relationship aliases use them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_league_id_fkey;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE RESTRICT;

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_home_team_id_fkey;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_home_team_id_fkey
  FOREIGN KEY (home_team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE public.picks DROP CONSTRAINT IF EXISTS picks_away_team_id_fkey;
ALTER TABLE public.picks
  ADD CONSTRAINT picks_away_team_id_fkey
  FOREIGN KEY (away_team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- Confidence is a percentage. 0% is valid, so align DB and editor semantics.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pick_predictions
  DROP CONSTRAINT IF EXISTS pick_predictions_confidence_range;
ALTER TABLE public.pick_predictions
  ADD CONSTRAINT pick_predictions_confidence_range
  CHECK (confidence BETWEEN 0 AND 100);

COMMENT ON COLUMN public.leagues.slug IS 'Stable sport-scoped slug used by the admin catalog.';
COMMENT ON COLUMN public.teams.slug IS 'Stable sport-scoped slug used by the admin catalog.';
