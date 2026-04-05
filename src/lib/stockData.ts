export type ETFType = "nifty50" | "spy";

export interface Company {
  symbol: string;
  name: string;
  sector: string;
  website: string;
  etf: ETFType;
  tradingViewSymbol: string; // e.g. "NSE:RELIANCE" or "AAPL"
}

export interface Citation {
  title: string;
  url: string;
  source: string;
}

export interface PredictionData {
  priceTarget1w: number | null;
  priceTarget1m: number | null;
  priceTarget3m: number | null;
  priceTarget1y: number | null;
  recommendation: "buy" | "hold" | "sell" | null;
  confidenceScore: number | null;
  predictionReasoning: string;
}

export interface MacroAnalysis {
  geopoliticalAnalysis: string;
  controversyScanner: string;
  macroEconomicFactors: string;
  sectorTailwindsHeadwinds: string;
  regionalSentiment: string;
  mediaManipulationCheck: string;
}

export interface AnalysisResult {
  id: string;
  company: Company;
  overallScore: number;
  sentiment: "bullish" | "bearish" | "neutral";
  summary: string;
  websiteInsights: string;
  financialHighlights: string;
  newsDigest: string;
  detailedAnalysis: string;
  competitivePosition: string;
  managementOutlook: string;
  strengths: string[];
  risks: string[];
  citations: Citation[];
  lastUpdated: string;
  prediction?: PredictionData;
  isLoading?: boolean;
}

export const NIFTY50_TOP10: Company[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", website: "https://www.ril.com", etf: "nifty50", tradingViewSymbol: "NSE:RELIANCE" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", website: "https://www.tcs.com", etf: "nifty50", tradingViewSymbol: "NSE:TCS" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", website: "https://www.hdfcbank.com", etf: "nifty50", tradingViewSymbol: "NSE:HDFCBANK" },
  { symbol: "INFY", name: "Infosys", sector: "IT", website: "https://www.infosys.com", etf: "nifty50", tradingViewSymbol: "NSE:INFY" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", website: "https://www.icicibank.com", etf: "nifty50", tradingViewSymbol: "NSE:ICICIBANK" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", website: "https://www.hul.co.in", etf: "nifty50", tradingViewSymbol: "NSE:HINDUNILVR" },
  { symbol: "ITC", name: "ITC Limited", sector: "FMCG", website: "https://www.itcportal.com", etf: "nifty50", tradingViewSymbol: "NSE:ITC" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", website: "https://www.sbi.co.in", etf: "nifty50", tradingViewSymbol: "NSE:SBIN" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", website: "https://www.airtel.in", etf: "nifty50", tradingViewSymbol: "NSE:BHARTIARTL" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", website: "https://www.kotak.com", etf: "nifty50", tradingViewSymbol: "NSE:KOTAKBANK" },
];

export const SPY_TOP10: Company[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", website: "https://www.apple.com", etf: "spy", tradingViewSymbol: "AAPL" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology", website: "https://www.microsoft.com", etf: "spy", tradingViewSymbol: "MSFT" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", website: "https://www.nvidia.com", etf: "spy", tradingViewSymbol: "NVDA" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", website: "https://www.google.com", etf: "spy", tradingViewSymbol: "GOOGL" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer", website: "https://www.amazon.com", etf: "spy", tradingViewSymbol: "AMZN" },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Technology", website: "https://www.meta.com", etf: "spy", tradingViewSymbol: "META" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", website: "https://www.berkshirehathaway.com", etf: "spy", tradingViewSymbol: "BRK.B" },
  { symbol: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", website: "https://www.lilly.com", etf: "spy", tradingViewSymbol: "LLY" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", website: "https://www.jpmorganchase.com", etf: "spy", tradingViewSymbol: "JPM" },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", website: "https://www.visa.com", etf: "spy", tradingViewSymbol: "V" },
];

export function getCompanies(etf: ETFType): Company[] {
  return etf === "nifty50" ? NIFTY50_TOP10 : SPY_TOP10;
}

export function getAllCompanies(): Company[] {
  return [...NIFTY50_TOP10, ...SPY_TOP10];
}

export function findCompany(symbol: string): Company | undefined {
  return getAllCompanies().find((c) => c.symbol === symbol);
}

export function getSentimentColor(sentiment: "bullish" | "bearish" | "neutral"): string {
  switch (sentiment) {
    case "bullish": return "text-gain";
    case "bearish": return "text-loss";
    case "neutral": return "text-warning";
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-gain";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

export function getSectors(etf: ETFType): string[] {
  const companies = getCompanies(etf);
  return [...new Set(companies.map((c) => c.sector))];
}
