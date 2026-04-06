import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { SymbolSearch } from "@/components/options/SymbolSearch";
import { LivePredictions } from "@/components/options/LivePredictions";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { fetchIntradayData, fetchHistoricalData, type IntradayData } from "@/lib/api/optionsData";
import { getCachedAnalysis, analyzeCompany } from "@/lib/api/stockAnalysis";
import { replayHistoricalData } from "@/lib/signalLearner";
import type { AnalysisResult } from "@/lib/stockData";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Activity } from "lucide-react";
import { NIFTY50_FULL, SPY500_FULL, ETF_ENTRIES } from "@/lib/companyData";

export default function OptionsTrading() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const symbol = searchParams.get("symbol") || "AAPL";
  const [loading, setLoading] = useState(false);
  const [intradayData, setIntradayData] = useState<IntradayData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzingMacro, setAnalyzingMacro] = useState(false);
  const [historicalStatus, setHistoricalStatus] = useState<string | null>(null);
  const analysisTriggerRef = useRef<string | null>(null);
  const historicalRef = useRef<string | null>(null);

  const allCompanies = [...ETF_ENTRIES, ...NIFTY50_FULL, ...SPY500_FULL];
  const company = allCompanies.find((c) => c.symbol === symbol);
  const isNifty50 = company?.etf === "nifty50";
  const tvSymbol = company?.tradingViewSymbol || (symbol.includes(".") ? symbol : `NASDAQ:${symbol}`);

  // Auto-trigger analysis for ETFs/stocks when no cached analysis exists
  const triggerAnalysisIfMissing = useCallback(async (sym: string) => {
    if (analysisTriggerRef.current === sym) return; // already triggered
    const comp = allCompanies.find((c) => c.symbol === sym);
    if (!comp) return;
    analysisTriggerRef.current = sym;
    setAnalyzingMacro(true);
    try {
      const result = await analyzeCompany(comp);
      setAnalysis(result);
      toast({ title: "Analysis Ready", description: `Micro/macro data loaded for ${sym}` });
    } catch {
      // silent - predictions still work without it
    } finally {
      setAnalyzingMacro(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const loadData = useCallback(async (sym: string) => {
    setLoading(true);
    analysisTriggerRef.current = null;
    try {
      const [intraday, cached] = await Promise.all([
        fetchIntradayData(sym),
        getCachedAnalysis(sym),
      ]);
      setIntradayData(intraday);
      setAnalysis(cached);
      if (!intraday) toast({ title: "No data", description: `Could not load data for ${sym}`, variant: "destructive" });
      // If no cached analysis, auto-trigger it in background
      if (!cached) {
        triggerAnalysisIfMissing(sym);
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, triggerAnalysisIfMissing]);

  useEffect(() => { loadData(symbol); }, [symbol, loadData]);

  // Fetch 60-day historical data and replay through learning engine
  useEffect(() => {
    if (historicalRef.current === symbol) return;
    historicalRef.current = symbol;
    setHistoricalStatus("Loading 60-day historical data…");
    fetchHistoricalData(symbol).then((hist) => {
      if (hist && hist.candles.length > 0) {
        setHistoricalStatus(`Replaying ${hist.totalCandles} candles through learning engine…`);
        const result = replayHistoricalData(symbol, hist.candles);
        if (result.verified > 0) {
          setHistoricalStatus(`Learned from ${result.verified} historical predictions`);
          setTimeout(() => setHistoricalStatus(null), 3000);
        } else {
          setHistoricalStatus(null); // already replayed
        }
      } else {
        setHistoricalStatus(null);
      }
    }).catch(() => setHistoricalStatus(null));
  }, [symbol]);

  // Refresh intraday data every 1s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const intraday = await fetchIntradayData(symbol);
        if (intraday) setIntradayData(intraday);
      } catch { /* silent */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Re-fetch macro analysis every 60s for live macro updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const comp = allCompanies.find((c) => c.symbol === symbol);
      if (!comp) return;
      try {
        const result = await analyzeCompany(comp);
        if (result) setAnalysis(result);
      } catch { /* silent */ }
    }, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="px-6 py-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Live Trading Signals</h2>
              <p className="text-sm text-muted-foreground">Real-time buy/sell predictions · refreshing every second</p>
            </div>
          </div>
          <SymbolSearch value={symbol} onChange={(s) => setSearchParams({ symbol: s })} />
        </div>

        {analyzingMacro && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading micro & macro analysis for {symbol}…
          </div>
        )}

        {historicalStatus && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-chart-4/20 bg-chart-4/5 px-4 py-2 text-sm text-chart-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {historicalStatus}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading {symbol}…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <TradingViewChart symbol={tvSymbol} height={isNifty50 ? 1000 : 2000} interval="1" />
            <LivePredictions data={intradayData} symbol={symbol} analysis={analysis} isIndian={isNifty50} />
          </div>
        )}
      </div>
    </div>
  );
}
