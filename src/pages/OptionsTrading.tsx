import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { SymbolSearch } from "@/components/options/SymbolSearch";
import { LivePredictions } from "@/components/options/LivePredictions";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { fetchIntradayData, type IntradayData } from "@/lib/api/optionsData";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Activity } from "lucide-react";

export default function OptionsTrading() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const symbol = searchParams.get("symbol") || "AAPL";
  const [loading, setLoading] = useState(false);
  const [intradayData, setIntradayData] = useState<IntradayData | null>(null);

  const loadData = useCallback(async (sym: string) => {
    setLoading(true);
    try {
      const intraday = await fetchIntradayData(sym);
      setIntradayData(intraday);
      if (!intraday) toast({ title: "No data", description: `Could not load data for ${sym}`, variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(symbol); }, [symbol, loadData]);

  // 1-second live refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const intraday = await fetchIntradayData(symbol);
        if (intraday) setIntradayData(intraday);
      } catch { /* silent */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  const tvSymbol = symbol.includes(".") ? symbol : `NASDAQ:${symbol}`;

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

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading {symbol}…</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* TradingView chart — full width */}
            <TradingViewChart symbol={tvSymbol} height={500} interval="1" />
            {/* Live signals below */}
            <LivePredictions data={intradayData} symbol={symbol} />
          </div>
        )}
      </div>
    </div>
  );
}
