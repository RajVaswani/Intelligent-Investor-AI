
-- Drop the broad ALL policy
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Admin SELECT (in addition to existing "Users can read own roles")
CREATE POLICY "Admins can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Restrictive policy: block all writes unless admin
CREATE POLICY "Only admins can modify roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
