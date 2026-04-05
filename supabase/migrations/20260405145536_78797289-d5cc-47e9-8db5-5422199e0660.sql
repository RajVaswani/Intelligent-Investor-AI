ALTER TABLE public.stock_analyses
ADD COLUMN price_target_1w numeric,
ADD COLUMN price_target_1m numeric,
ADD COLUMN price_target_3m numeric,
ADD COLUMN price_target_1y numeric,
ADD COLUMN recommendation text,
ADD COLUMN confidence_score integer,
ADD COLUMN prediction_reasoning text;