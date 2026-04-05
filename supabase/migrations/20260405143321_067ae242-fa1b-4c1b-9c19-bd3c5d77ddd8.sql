
CREATE TABLE public.stock_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  etf TEXT NOT NULL,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  sentiment TEXT NOT NULL,
  summary TEXT NOT NULL,
  website_insights TEXT,
  financial_highlights TEXT,
  news_digest TEXT,
  strengths TEXT[] DEFAULT '{}',
  risks TEXT[] DEFAULT '{}',
  raw_scraped_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, etf)
);

ALTER TABLE public.stock_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read stock analyses" ON public.stock_analyses FOR SELECT USING (true);
CREATE POLICY "Service role can manage analyses" ON public.stock_analyses FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_stock_analyses_updated_at
  BEFORE UPDATE ON public.stock_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
