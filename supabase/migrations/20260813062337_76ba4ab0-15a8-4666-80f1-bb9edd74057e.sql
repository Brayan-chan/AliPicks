REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_pick_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pick_access(uuid, uuid) TO authenticated;

DROP POLICY "picks_public_read" ON public.picks;
CREATE POLICY "picks_anon_read" ON public.picks FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "picks_auth_read" ON public.picks FOR SELECT TO authenticated USING (is_published = true OR public.has_role(auth.uid(),'admin'));