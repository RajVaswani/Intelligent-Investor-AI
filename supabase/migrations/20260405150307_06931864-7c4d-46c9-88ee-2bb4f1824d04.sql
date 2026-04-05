ALTER TABLE public.stock_analyses
ADD COLUMN geopolitical_analysis text,
ADD COLUMN controversy_scanner text,
ADD COLUMN macro_economic_factors text,
ADD COLUMN sector_tailwinds_headwinds text,
ADD COLUMN regional_sentiment text,
ADD COLUMN media_manipulation_check text;