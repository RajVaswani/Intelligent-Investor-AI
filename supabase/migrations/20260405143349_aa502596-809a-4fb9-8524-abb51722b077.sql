
DROP POLICY "Service role can manage analyses" ON public.stock_analyses;

CREATE POLICY "Only service role can insert" ON public.stock_analyses FOR INSERT WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);
CREATE POLICY "Only service role can update" ON public.stock_analyses FOR UPDATE USING (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);
CREATE POLICY "Only service role can delete" ON public.stock_analyses FOR DELETE USING (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);
