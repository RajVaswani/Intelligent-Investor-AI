import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { fetchIntradayData, type IntradayData } from "@/lib/api/optionsData";
import { getCachedAnalysis, analyzeCompany } from "@/lib/api/stockAnalysis";
import { computeLiveSignals, type LiveSignals, type AnalysisInput } from "@/lib/signalEngine";
import { getAccuracyStats } from "@/lib/signalLearner";
import { evaluate100PctSignal, type HighConvictionEntry } from "@/components/options/HighConvictionSignals";
import type { AnalysisResult } from "@/lib/stockData";
import { NIFTY50_FULL, SPY500_FULL, ETF_ENTRIES } from "@/lib/companyData";
import { Crosshair, ShieldCheck, TrendingUp, TrendingDown, Minus, Activity, Clock, Loader2, ExternalLink, DollarSign, Brain, BarChart3 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOP_SYMBOLS = [
  "SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX",
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
];

const allCompanies = [...ETF_ENTRIES, ...NIFTY50_FULL, ...SPY500_FULL];

interface SymbolState {
  symbol: string;
  name: string;
  intradayData: IntradayData | null;
  analysis: AnalysisResult | null;
  signals: LiveSignals | null;
  convictionSignals: HighConvictionEntry[];
  lastSignalTime: number;
  loading: boolean;
  isIndian: boolean;
}

export default function OptionsMaster() {
  const navigate = useNavigate();
  const [symbolStates, setSymbolStates] = useState<Record<string, SymbolState>>({});
  const [tick, setTick] = useState(0);
  const initRef = useRef(false);

  // Initialize all symbols
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initial: Record<string, SymbolState> = {};
    for (const sym of TOP_SYMBOLS) {
      const comp = allCompanies.find(c => c.symbol === sym);
      initial[sym] = {
        symbol: sym,
        name: comp?.name || sym,
        intradayData: null,
        analysis: null,
        signals: null,
        convictionSignals: [],
        lastSignalTime: 0,
        loading: true,
        isIndian: comp?.etf === "nifty50",
      };
    }
    setSymbolStates(initial);

    // Load initial data for all symbols
    TOP_SYMBOLS.forEach(async (sym) => {
      const comp = allCompanies.find(c => c.symbol === sym);
      try {
        const [intraday, cached] = await Promise.all([
          fetchIntradayData(sym),
          getCachedAnalysis(sym),
        ]);
        setSymbolStates(prev => ({
          ...prev,
          [sym]: { ...prev[sym], intradayData: intraday, analysis: cached, loading: false },
        }));
        // Auto-trigger analysis if missing
        if (!cached && comp) {
          try {
            const result = await analyzeCompany(comp);
            setSymbolStates(prev => ({
              ...prev,
              [sym]: { ...prev[sym], analysis: result },
            }));
          } catch { /* silent */ }
        }
      } catch {
        setSymbolStates(prev => ({
          ...prev,
          [sym]: { ...prev[sym], loading: false },
        }));
      }
    });
  }, []);

  // Refresh intraday data every 2s (staggered across symbols)
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      const symbols = Object.keys(symbolStates);
      if (symbols.length === 0) return;

      // Refresh 3 symbols per tick to avoid overwhelming
      const batchSize = 3;
      const offset = (tick * batchSize) % symbols.length;
      const batch = symbols.slice(offset, offset + batchSize);

      batch.forEach(async (sym) => {
        try {
          const intraday = await fetchIntradayData(sym);
          if (intraday) {
            setSymbolStates(prev => ({
              ...prev,
              [sym]: { ...prev[sym], intradayData: intraday },
            }));
          }
        } catch { /* silent */ }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [symbolStates, tick]);

  // Compute signals and evaluate conviction for all symbols every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSymbolStates(prev => {
        const next = { ...prev };
        for (const sym of Object.keys(next)) {
          const state = next[sym];
          if (!state.intradayData?.candles) continue;

          const analysisInput: AnalysisInput | null = state.analysis ? {
            overallScore: state.analysis.overallScore,
            sentiment: state.analysis.sentiment,
            summary: state.analysis.summary,
            financialHighlights: state.analysis.financialHighlights,
            newsDigest: state.analysis.newsDigest,
            recommendation: state.analysis.prediction?.recommendation,
            confidenceScore: state.analysis.prediction?.confidenceScore,
            predictionReasoning: state.analysis.prediction?.predictionReasoning,
            macro: state.analysis.macro,
            strengths: state.analysis.strengths,
            risks: state.analysis.risks,
          } : null;

          const signals = computeLiveSignals(state.intradayData.candles, analysisInput, sym);
          if (!signals) continue;

          const stats = getAccuracyStats(sym);
          const now = Date.now();
          let convictionSignals = state.convictionSignals;
          let lastSignalTime = state.lastSignalTime;

          // Evaluate conviction (min 10s gap)
          if (now - lastSignalTime > 10000) {
            const result = evaluate100PctSignal(signals, { ...stats, weights: stats.weights as unknown as Record<string, number> });
            if (result.signal) {
              const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              convictionSignals = [...convictionSignals, {
                time: timeStr,
                timestamp: now,
                price: signals.currentPrice,
                signal: result.signal,
                allAgree: result.passedCount === result.totalChecks,
                confidence: Math.round((result.passedCount / result.totalChecks) * 100),
                reasons: result.reasons,
                symbol: sym,
              }].slice(-30);
              lastSignalTime = now;
            }
          }

          next[sym] = { ...state, signals, convictionSignals, lastSignalTime };
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Aggregate all conviction signals across symbols, sorted by most recent
  const allSignals = useMemo(() => {
    return Object.values(symbolStates)
      .flatMap(s => s.convictionSignals.map(c => ({ ...c, symbol: s.symbol, name: s.name, isIndian: s.isIndian })))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }, [symbolStates, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live status per symbol
  const symbolSummaries = useMemo(() => {
    return Object.values(symbolStates).map(s => ({
      ...s,
      signalCount: s.convictionSignals.length,
      lastSignal: s.convictionSignals[s.convictionSignals.length - 1] || null,
      curr: s.isIndian ? "₹" : "$",
    }));
  }, [symbolStates]);

  const activeCount = symbolSummaries.filter(s => s.signals).length;
  const totalSignals = allSignals.length;

  // Read global auto-trader P&L data
  const [traderPnL, setTraderPnL] = useState<Record<string, any>>({});
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).__autoTraderPnL) {
        setTraderPnL({ ...(window as any).__autoTraderPnL });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const aggregatePnL = useMemo(() => {
    const entries = Object.entries(traderPnL);
    if (entries.length === 0) return null;
    let totalPnl = 0, totalRealized = 0, totalUnrealized = 0, totalWins = 0, totalLosses = 0, totalTrades = 0, openPositions = 0;
    const perSymbol: { symbol: string; pnl: number; roi: number; wins: number; losses: number; trades: number; currency: string }[] = [];
    for (const [sym, data] of entries) {
      totalPnl += data.totalPnl || 0;
      totalRealized += data.realizedPnl || 0;
      totalUnrealized += data.unrealizedPnl || 0;
      totalWins += data.wins || 0;
      totalLosses += data.losses || 0;
      totalTrades += data.totalTrades || 0;
      openPositions += data.openTrades || 0;
      perSymbol.push({ symbol: sym, pnl: data.totalPnl || 0, roi: data.roi || 0, wins: data.wins || 0, losses: data.losses || 0, trades: data.totalTrades || 0, currency: data.currency || "$" });
    }
    const winRate = (totalWins + totalLosses) > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
    return { totalPnl, totalRealized, totalUnrealized, totalWins, totalLosses, winRate, totalTrades, openPositions, perSymbol: perSymbol.sort((a, b) => b.pnl - a.pnl) };
  }, [traderPnL]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="px-6 py-4">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
              <Crosshair className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                Options Master
                <ShieldCheck className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-sm text-muted-foreground">
                80%+ conviction signals across {TOP_SYMBOLS.length} symbols · Live streaming
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
              </span>
              <span className="text-xs font-medium text-chart-2">LIVE</span>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-mono text-primary">{activeCount}/{TOP_SYMBOLS.length} streaming</span>
            <span className="rounded-full bg-chart-2/10 px-3 py-1 text-xs font-mono text-chart-2">{totalSignals} signals</span>
          </div>
        </div>

        {/* Aggregate Auto-Trader P&L Overview */}
        {aggregatePnL && (
          <div className={`mb-4 rounded-2xl border-2 p-4 ${aggregatePnL.totalPnl >= 0 ? "border-chart-2/40 bg-chart-2/5 shadow-[0_0_20px_-5px_hsl(var(--chart-2)/0.3)]" : "border-destructive/40 bg-destructive/5 shadow-[0_0_20px_-5px_hsl(var(--destructive)/0.3)]"}`}>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Auto-Trader P&L Overview</h3>
              <Brain className="h-4 w-4 text-primary/60" />
              <span className="text-[10px] text-muted-foreground">Self-learning · All symbols</span>
              <span className="ml-auto relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] text-primary font-medium">LIVE</span>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 mb-3">
              <div className={`rounded-lg border p-2.5 text-center relative overflow-hidden ${aggregatePnL.totalPnl >= 0 ? "border-chart-2/50 bg-chart-2/10" : "border-destructive/50 bg-destructive/10"}`}>
                {aggregatePnL.totalPnl > 0 && <div className="absolute inset-0 bg-gradient-to-t from-chart-2/10 to-chart-2/5 pointer-events-none" />}
                <div className="relative text-[9px] uppercase text-muted-foreground">Total P&L</div>
                <div className={`relative text-xl font-bold font-mono ${aggregatePnL.totalPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                  {aggregatePnL.totalPnl >= 0 ? "+" : ""}${aggregatePnL.totalPnl.toFixed(2)}
                </div>
              </div>
              <div className={`rounded-lg border p-2.5 text-center ${aggregatePnL.totalRealized >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
                <div className="text-[9px] uppercase text-muted-foreground">Realized</div>
                <div className={`text-lg font-bold font-mono ${aggregatePnL.totalRealized >= 0 ? "text-chart-2" : "text-destructive"}`}>
                  {aggregatePnL.totalRealized >= 0 ? "+" : ""}${aggregatePnL.totalRealized.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Win Rate</div>
                <div className="text-lg font-bold font-mono text-primary">{aggregatePnL.winRate.toFixed(0)}%</div>
                <div className="text-[9px] text-muted-foreground">{aggregatePnL.totalWins}W / {aggregatePnL.totalLosses}L</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Total Trades</div>
                <div className="text-lg font-bold font-mono text-foreground">{aggregatePnL.totalTrades}</div>
                <div className="text-[9px] text-muted-foreground">{aggregatePnL.openPositions} open</div>
              </div>
              <div className={`rounded-lg border p-2.5 text-center ${aggregatePnL.totalUnrealized >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
                <div className="text-[9px] uppercase text-muted-foreground">Unrealized</div>
                <div className={`text-sm font-bold font-mono ${aggregatePnL.totalUnrealized >= 0 ? "text-chart-2" : "text-destructive"}`}>
                  {aggregatePnL.totalUnrealized >= 0 ? "+" : ""}${aggregatePnL.totalUnrealized.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Per-symbol P&L breakdown */}
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {aggregatePnL.perSymbol.map(s => (
                <button
                  key={s.symbol}
                  onClick={() => navigate(`/options?symbol=${s.symbol}`)}
                  className={`rounded-lg border p-2 flex items-center gap-2 text-left transition-all hover:shadow-sm cursor-pointer ${
                    s.pnl >= 0 ? "border-chart-2/20 bg-chart-2/5 hover:border-chart-2/40" : "border-destructive/20 bg-destructive/5 hover:border-destructive/40"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground w-12">{s.symbol}</span>
                  <span className={`text-xs font-bold font-mono flex-1 ${s.pnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                    {s.pnl >= 0 ? "+" : ""}{s.currency}{s.pnl.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{s.wins}W/{s.losses}L</span>
                  <span className="text-[9px] text-muted-foreground">{s.trades}t</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: Symbol cards grid */}
          <div className="lg:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {symbolSummaries.map(s => (
                <button
                  key={s.symbol}
                  onClick={() => navigate(`/options?symbol=${s.symbol}`)}
                  className="rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{s.symbol}</span>
                      {s.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    {s.signals && (
                      <span className="text-sm font-bold font-mono text-foreground">
                        {s.curr}{s.signals.currentPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mb-2">{s.name}</div>

                  {/* Quick indicators */}
                  {s.signals && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className={`rounded px-1 py-0.5 text-[9px] font-mono ${s.signals.trend === "up" ? "bg-chart-2/15 text-chart-2" : s.signals.trend === "down" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {s.signals.trend === "up" ? "↑" : s.signals.trend === "down" ? "↓" : "—"} {s.signals.trend}
                      </span>
                      <span className={`rounded px-1 py-0.5 text-[9px] font-mono ${s.signals.rsi > 70 ? "bg-destructive/15 text-destructive" : s.signals.rsi < 30 ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
                        RSI {s.signals.rsi.toFixed(0)}
                      </span>
                      <span className={`rounded px-1 py-0.5 text-[9px] font-mono ${s.signals.macdSignal === "bullish" ? "bg-chart-2/15 text-chart-2" : s.signals.macdSignal === "bearish" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        MACD {s.signals.macdSignal}
                      </span>
                    </div>
                  )}

                  {/* Conviction status */}
                  {s.signalCount > 0 ? (
                    <div className={`rounded-lg border p-1.5 ${s.lastSignal?.signal === "BUY" ? "border-chart-2/30 bg-chart-2/10" : "border-destructive/30 bg-destructive/10"}`}>
                      <div className="flex items-center gap-1.5">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${s.lastSignal?.signal === "BUY" ? "bg-chart-2 text-background" : "bg-destructive text-background"}`}>
                          {s.lastSignal?.signal === "BUY" ? "B" : "S"}
                        </div>
                        <span className={`text-xs font-bold ${s.lastSignal?.signal === "BUY" ? "text-chart-2" : "text-destructive"}`}>
                          {s.lastSignal?.signal} @ {s.curr}{s.lastSignal?.price.toFixed(2)}
                        </span>
                        <span className="ml-auto text-[9px] text-muted-foreground">{s.signalCount} total</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-1.5 text-center text-[10px] text-muted-foreground">
                      Scanning…
                    </div>
                  )}

                  <div className="mt-1.5 flex items-center justify-end gap-1 text-[9px] text-primary">
                    <ExternalLink className="h-2.5 w-2.5" /> Details
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Live signal feed */}
          <div className="rounded-2xl border-2 border-primary/20 bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Live Signal Feed
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
                </span>
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">All 80%+ conviction signals across symbols</p>
            </div>
            <ScrollArea className="h-[70vh]">
              <div className="p-3 space-y-2">
                {allSignals.length === 0 ? (
                  <div className="py-16 text-center">
                    <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No 80%+ conviction signals yet.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">At least 11 of 13 indicators must align for a signal to appear here.</p>
                  </div>
                ) : (
                  allSignals.map((sig, i) => (
                    <button
                      key={`${sig.timestamp}-${i}`}
                      onClick={() => navigate(`/options?symbol=${sig.symbol}`)}
                      className={`w-full rounded-xl border p-3 text-left transition-all hover:shadow-md cursor-pointer ${
                        sig.signal === "BUY"
                          ? "border-chart-2/40 bg-chart-2/5 hover:border-chart-2/60"
                          : "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                          sig.signal === "BUY" ? "bg-chart-2 text-background" : "bg-destructive text-background"
                        }`}>
                          {sig.signal === "BUY" ? "B" : "S"}
                        </div>
                        <span className="text-sm font-bold text-foreground">{sig.symbol}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{sig.name}</span>
                        <span className={`ml-auto text-sm font-bold font-mono ${sig.signal === "BUY" ? "text-chart-2" : "text-destructive"}`}>
                          {sig.signal} {sig.isIndian ? "₹" : "$"}{sig.price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mb-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{sig.time}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sig.reasons.slice(0, 5).map((r, j) => (
                          <span key={j} className="rounded bg-background/60 border border-border/50 px-1.5 py-0.5 text-[8px] text-foreground">
                            ✓ {r}
                          </span>
                        ))}
                        {sig.reasons.length > 5 && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] text-primary">
                            +{sig.reasons.length - 5} more
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
