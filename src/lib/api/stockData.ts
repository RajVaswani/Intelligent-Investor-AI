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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const url = `${supabaseUrl}/functions/v1/stock-data?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  return json.data;
}
