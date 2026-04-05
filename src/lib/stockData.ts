export type ETFType = "nifty50" | "spy";

export interface Company {
  symbol: string;
  name: string;
  sector: string;
  website: string;
  etf: ETFType;
}

export interface AnalysisResult {
  id: string;
  company: Company;
  overallScore: number; // 0-100
  sentiment: "bullish" | "bearish" | "neutral";
  summary: string;
  websiteInsights: string;
  financialHighlights: string;
  newsDigest: string;
  strengths: string[];
  risks: string[];
  lastUpdated: string;
  isLoading?: boolean;
}

export const NIFTY50_TOP10: Company[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", website: "https://www.ril.com", etf: "nifty50" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", website: "https://www.tcs.com", etf: "nifty50" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", website: "https://www.hdfcbank.com", etf: "nifty50" },
  { symbol: "INFY", name: "Infosys", sector: "IT", website: "https://www.infosys.com", etf: "nifty50" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking", website: "https://www.icicibank.com", etf: "nifty50" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", website: "https://www.hul.co.in", etf: "nifty50" },
  { symbol: "ITC", name: "ITC Limited", sector: "FMCG", website: "https://www.itcportal.com", etf: "nifty50" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", website: "https://www.sbi.co.in", etf: "nifty50" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", website: "https://www.airtel.in", etf: "nifty50" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking", website: "https://www.kotak.com", etf: "nifty50" },
];

export const SPY_TOP10: Company[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", website: "https://www.apple.com", etf: "spy" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology", website: "https://www.microsoft.com", etf: "spy" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", website: "https://www.nvidia.com", etf: "spy" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", website: "https://www.google.com", etf: "spy" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer", website: "https://www.amazon.com", etf: "spy" },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Technology", website: "https://www.meta.com", etf: "spy" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", website: "https://www.berkshirehathaway.com", etf: "spy" },
  { symbol: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", website: "https://www.lilly.com", etf: "spy" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", website: "https://www.jpmorganchase.com", etf: "spy" },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", website: "https://www.visa.com", etf: "spy" },
];

export function getCompanies(etf: ETFType): Company[] {
  return etf === "nifty50" ? NIFTY50_TOP10 : SPY_TOP10;
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
