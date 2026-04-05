-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  ibkr_gateway_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User portfolio holdings
CREATE TABLE public.user_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  company_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  sector text,
  exchange text,
  currency text DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

ALTER TABLE public.user_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own portfolio" ON public.user_portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolio" ON public.user_portfolios FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolio" ON public.user_portfolios FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolio" ON public.user_portfolios FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_portfolios_updated_at BEFORE UPDATE ON public.user_portfolios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();