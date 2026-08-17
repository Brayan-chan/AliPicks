-- Local-only QA seed for AliPicks.
-- This file is executed by `supabase db reset` in local development.
-- Credentials are intentionally non-production and must never be reused remotely.

DO $$
DECLARE
  v_user_id uuid := '94000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin.local@alipicks.test',
    extensions.crypt('AliPicksLocal123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"AliPicks Local Admin","is_adult":true}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now();

  INSERT INTO public.profiles (id, email, full_name, is_adult)
  VALUES (v_user_id, 'admin.local@alipicks.test', 'AliPicks Local Admin', true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_adult = EXCLUDED.is_adult;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Keep the local QA dataset intentionally small. Ligas, equipos and picks should
-- be created through the actual Admin UI during functional testing so React Query,
-- validation and the domain RPCs are exercised end-to-end.
