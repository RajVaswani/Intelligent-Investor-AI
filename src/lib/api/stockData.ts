import { supabase } from "@/integrations/supabase/client";

export interface StockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  symbol: string;
  currency: string;
  exchange: string;
  regularMarketPrice: number;
  previousClose: number;
  regularMarketTime: number | null;
  candles: StockCandle[];
}

export async function fetchStockData(
  symbol: string,
  range = "1d",
  interval = "5m"
): Promise<StockData | null> {
  const { data, error } = await supabase.functions.invoke("stock-data", {
    body: { symbol, range, interval },
  });

  if (error || !data?.success) return null;
  return data.data;
}
