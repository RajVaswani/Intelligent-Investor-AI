
CREATE POLICY "Admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read all portfolios"
ON public.user_portfolios
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
