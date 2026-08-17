GRANT INSERT, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));