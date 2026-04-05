import { supabase } from "@/integrations/supabase/client";

export interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: number | null;
}

export interface OptionsChainData {
  symbol: string;
  regularMarketPrice: number;
  expirations: number[];
  strikes: number[];
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface IntradayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}

export interface VolumeProfileEntry {
  price: number;
  volume: number;
}

export interface IntradayData {
  symbol: string;
  currency: string;
  regularMarketPrice: number;
  previousClose: number;
  candles: IntradayCandle[];
  support: { s1: number; s2: number };
  resistance: { r1: number; r2: number };
  pivot: number;
  volumeProfile: VolumeProfileEntry[];
  dayHigh: number;
  dayLow: number;
}

export interface StrategyLeg {
  action: string;
  type: string;
  strike: number;
  premium: number;
}

export interface OptionsStrategy {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  legs: StrategyLeg[];
  maxProfit: string;
  maxLoss: string;
  breakeven: number;
  confidence: number;
  reasoning: string;
}

export interface AIStrategyResult {
  strategies: OptionsStrategy[];
  marketOutlook: string;
  ivAnalysis: string;
  keyLevels: { support?: number; resistance?: number };
  riskWarning: string;
}

// Nifty 50 symbols need .NS suffix for Yahoo Finance
import { NIFTY50_FULL } from "@/lib/companyData";
const NIFTY_SYMBOLS = new Set(NIFTY50_FULL.map((c) => c.symbol));
function toYahooSymbol(sym: string): string {
  return NIFTY_SYMBOLS.has(sym) ? `${sym}.NS` : sym;
}

export async function fetchOptionsChain(symbol: string): Promise<OptionsChainData | null> {
  const yahooSymbol = toYahooSymbol(symbol);
  const { data, error } = await supabase.functions.invoke("options-data", {
    body: { symbol: yahooSymbol, type: "chain" },
  });
  if (error || !data?.success) return null;
  return data.data;
}

export async function fetchIntradayData(symbol: string): Promise<IntradayData | null> {
  const yahooSymbol = toYahooSymbol(symbol);
  const { data, error } = await supabase.functions.invoke("options-data", {
    body: { symbol: yahooSymbol, type: "intraday" },
  });
  if (error || !data?.success) return null;
  return data.data;
}

export async function fetchAIStrategies(
  symbol: string,
  currentPrice: number,
  calls: OptionContract[],
  puts: OptionContract[],
  intraday?: { vwap: number; s1: number; r1: number; dayLow: number; dayHigh: number }
): Promise<AIStrategyResult | null> {
  const { data, error } = await supabase.functions.invoke("options-strategy", {
    body: { symbol, currentPrice, calls, puts, intraday },
  });
  if (error || !data?.success) return null;
  return data.data;
}
