import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { OptionsChain } from "@/components/options/OptionsChain";
import { IntradayAnalysis } from "@/components/options/IntradayAnalysis";
import { AIStrategies } from "@/components/options/AIStrategies";
import { SymbolSearch } from "@/components/options/SymbolSearch";
import { OptionsResearch } from "@/components/options/OptionsResearch";
import { LivePredictions } from "@/components/options/LivePredictions";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import {
  fetchOptionsChain,
  fetchIntradayData,
  fetchAIStrategies,
  type OptionsChainData,
  type IntradayData,
  type AIStrategyResult,
} from "@/lib/api/optionsData";
import { getCachedAnalysis } from "@/lib/api/stockAnalysis";
import type { AnalysisResult } from "@/lib/stockData";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, BarChart3, Brain, Activity, LineChart, Search, Zap } from "lucide-react";

type Tab = "live" | "chart" | "chain" | "intraday" | "strategies" | "research";

export default function OptionsTrading() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const symbol = searchParams.get("symbol") || "AAPL";
  const [activeTab, setActiveTab] = useState<Tab>("live");
  const [loading, setLoading] = useState(false);
  const [optionsData, setOptionsData] = useState<OptionsChainData | null>(null);
  const [intradayData, setIntradayData] = useState<IntradayData | null>(null);
  const [strategies, setStrategies] = useState<AIStrategyResult | null>(null);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const loadData = useCallback(async (sym: string) => {
    setLoading(true);
    setStrategies(null);
    setAnalysis(null);
    try {
      const [chain, intraday, cached] = await Promise.all([
        fetchOptionsChain(sym),
        fetchIntradayData(sym),
        getCachedAnalysis(sym),
      ]);
      setOptionsData(chain);
      setIntradayData(intraday);
      setAnalysis(cached);
      if (!chain && !intraday) {
        toast({ title: "No data found", description: `Could not load data for ${sym}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData(symbol);
  }, [symbol, loadData]);

  // 1-second live refresh for intraday data
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const intraday = await fetchIntradayData(symbol);
        if (intraday) setIntradayData(intraday);
      } catch {
        // silent
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  const handleSymbolChange = (sym: string) => {
    setSearchParams({ symbol: sym });
  };

  const loadStrategies = async () => {
    if (!optionsData) return;
    setStrategiesLoading(true);
    try {
      const lastCandle = intradayData?.candles?.[intradayData.candles.length - 1];
      const result = await fetchAIStrategies(
        symbol, optionsData.regularMarketPrice, optionsData.calls, optionsData.puts,
        intradayData ? { vwap: lastCandle?.vwap || 0, s1: intradayData.support.s1, r1: intradayData.resistance.r1, dayLow: intradayData.dayLow, dayHigh: intradayData.dayHigh } : undefined
      );
      setStrategies(result);
    } catch {
      toast({ title: "Error", description: "Failed to generate strategies", variant: "destructive" });
    } finally {
      setStrategiesLoading(false);
    }
  };

  const tvSymbol = symbol.includes(".") ? symbol : `NASDAQ:${symbol}`;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "live", label: "Live Signals", icon: <Zap className="h-4 w-4" /> },
    { id: "chart", label: "TradingView", icon: <LineChart className="h-4 w-4" /> },
    { id: "chain", label: "Options Chain", icon: <TrendingUp className="h-4 w-4" /> },
    { id: "intraday", label: "Intraday", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "strategies", label: "AI Strategies", icon: <Brain className="h-4 w-4" /> },
    { id: "research", label: "Micro/Macro", icon: <Search className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="px-6 py-4">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Live Trading Signals</h2>
              <p className="text-sm text-muted-foreground">
                Real-time buy/sell predictions refreshing every second
              </p>
            </div>
          </div>
          <SymbolSearch value={symbol} onChange={handleSymbolChange} />
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "strategies" && !strategies && !strategiesLoading) loadStrategies();
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading {symbol} data…</span>
          </div>
        )}

        {!loading && (
          <>
            {activeTab === "live" && <LivePredictions data={intradayData} symbol={symbol} />}
            {activeTab === "chart" && <TradingViewChart symbol={tvSymbol} height={550} interval="1" />}
            {activeTab === "chain" && <OptionsChain data={optionsData} />}
            {activeTab === "intraday" && <IntradayAnalysis data={intradayData} symbol={symbol} />}
            {activeTab === "strategies" && (
              <AIStrategies data={strategies} loading={strategiesLoading} onGenerate={loadStrategies} symbol={symbol} />
            )}
            {activeTab === "research" && (
              <OptionsResearch analysis={analysis} symbol={symbol} loading={analysisLoading} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
