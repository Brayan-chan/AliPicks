alter table public.picks
  add column if not exists published_at timestamptz,
  add column if not exists final_result text,
  add column if not exists edit_log jsonb not null default '[]'::jsonb;

update public.picks set published_at = coalesce(published_at, created_at) where is_published;