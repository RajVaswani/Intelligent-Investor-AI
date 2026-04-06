import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { fetchIntradayData, type IntradayData } from "@/lib/api/optionsData";
import { getCachedAnalysis, analyzeCompany } from "@/lib/api/stockAnalysis";
import { computeLiveSignals, type LiveSignals, type AnalysisInput } from "@/lib/signalEngine";
import { getAccuracyStats, recordTradeOutcome } from "@/lib/signalLearner";
import { loadTrades, saveTrades, type PersistedTrade } from "@/lib/tradeStore";
import type { AnalysisResult } from "@/lib/stockData";
import { NIFTY50_FULL, SPY500_FULL, ETF_ENTRIES } from "@/lib/companyData";
import { Crosshair, Brain, DollarSign, Loader2, ExternalLink, Zap, ArrowUpRight, ArrowDownRight, Clock, BarChart3, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
const TOP_SYMBOLS = [
  "SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX",
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
];

const allCompanies = [...ETF_ENTRIES, ...NIFTY50_FULL, ...SPY500_FULL];

const POSITION_SIZE = 1000;
const MIN_HOLD_MS = 0;
const MAX_HOLD_MS = 300_000;
const MIN_TRADE_GAP_MS = 1000;
const TAKE_PROFIT_PCT = 0.15;
const STOP_LOSS_PCT = 0.20;

interface SymbolState {
  symbol: string;
  name: string;
  intradayData: IntradayData | null;
  analysis: AnalysisResult | null;
  signals: LiveSignals | null;
  loading: boolean;
  isIndian: boolean;
  trades: PersistedTrade[];
  lastTradeTime: number;
}

function getBestPrediction(signals: LiveSignals): { direction: "LONG" | "SHORT"; confidence: number; reason: string } | null {
  const preds = signals.predictions;
  if (!preds || preds.length === 0) return null;
  let best = preds[0];
  for (const p of preds) { if (p.confidence > best.confidence) best = p; }
  const isBuy = best.signal === "STRONG BUY" || best.signal === "BUY";
  const isSell = best.signal === "STRONG SELL" || best.signal === "SELL";
  if (!isBuy && !isSell) {
    const actionable = preds.filter(p => p.signal !== "HOLD");
    if (actionable.length === 0) return null;
    const top = actionable.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const dir = top.signal === "STRONG BUY" || top.signal === "BUY" ? "LONG" : "SHORT";
    return { direction: dir, confidence: top.confidence, reason: `${top.signal} ${top.label} (${top.confidence}%)` };
  }
  return { direction: isBuy ? "LONG" : "SHORT", confidence: best.confidence, reason: `${best.signal} ${best.label} (${best.confidence}%)` };
}

export default function OptionsMaster() {
  const navigate = useNavigate();
  const [symbolStates, setSymbolStates] = useState<Record<string, SymbolState>>({});
  const [tick, setTick] = useState(0);
  const initRef = useRef(false);

  // Initialize
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const initial: Record<string, SymbolState> = {};
    for (const sym of TOP_SYMBOLS) {
      const comp = allCompanies.find(c => c.symbol === sym);
      initial[sym] = {
        symbol: sym, name: comp?.name || sym, intradayData: null, analysis: null, signals: null,
        loading: true, isIndian: comp?.etf === "nifty50", trades: loadTrades(sym), lastTradeTime: 0,
      };
    }
    setSymbolStates(initial);
    TOP_SYMBOLS.forEach(async (sym) => {
      const comp = allCompanies.find(c => c.symbol === sym);
      try {
        const [intraday, cached] = await Promise.all([fetchIntradayData(sym), getCachedAnalysis(sym)]);
        setSymbolStates(prev => ({ ...prev, [sym]: { ...prev[sym], intradayData: intraday, analysis: cached, loading: false } }));
        if (!cached && comp) {
          try {
            const result = await analyzeCompany(comp);
            setSymbolStates(prev => ({ ...prev, [sym]: { ...prev[sym], analysis: result } }));
          } catch { /* silent */ }
        }
      } catch {
        setSymbolStates(prev => ({ ...prev, [sym]: { ...prev[sym], loading: false } }));
      }
    });
  }, []);

  // Refresh intraday data every 2s staggered
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      const symbols = Object.keys(symbolStates);
      if (symbols.length === 0) return;
      const batchSize = 3;
      const offset = (tick * batchSize) % symbols.length;
      symbols.slice(offset, offset + batchSize).forEach(async (sym) => {
        try {
          const intraday = await fetchIntradayData(sym);
          if (intraday) setSymbolStates(prev => ({ ...prev, [sym]: { ...prev[sym], intradayData: intraday } }));
        } catch { /* silent */ }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [symbolStates, tick]);

  // Compute signals + auto-trade every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setSymbolStates(prev => {
        const next = { ...prev };
        for (const sym of Object.keys(next)) {
          const state = next[sym];
          if (!state.intradayData?.candles) continue;

          const analysisInput: AnalysisInput | null = state.analysis ? {
            overallScore: state.analysis.overallScore, sentiment: state.analysis.sentiment,
            summary: state.analysis.summary, financialHighlights: state.analysis.financialHighlights,
            newsDigest: state.analysis.newsDigest, recommendation: state.analysis.prediction?.recommendation,
            confidenceScore: state.analysis.prediction?.confidenceScore,
            predictionReasoning: state.analysis.prediction?.predictionReasoning,
            macro: state.analysis.macro, strengths: state.analysis.strengths, risks: state.analysis.risks,
          } : null;

          const signals = computeLiveSignals(state.intradayData.candles, analysisInput, sym);
          if (!signals) continue;

          let trades = [...state.trades];
          let lastTradeTime = state.lastTradeTime;
          const price = signals.currentPrice;

          // Auto-close: take-profit, stop-loss, max hold
          trades = trades.map(t => {
            if (t.status !== "OPEN") return t;
            const pnlPct = t.direction === "LONG"
              ? ((price - t.entryPrice) / t.entryPrice) * 100
              : ((t.entryPrice - price) / t.entryPrice) * 100;
            const holdTime = now - t.openedAt;
            if (pnlPct >= TAKE_PROFIT_PCT) {
              const pnl = t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price;
              return { ...t, exitPrice: price, exitTime: new Date(now).toLocaleTimeString(), pnl: pnl * (POSITION_SIZE / t.entryPrice), pnlPct, status: "CLOSED" as const, closedAt: now, reason: `${t.reason} → ✅ TP +${pnlPct.toFixed(2)}%` };
            }
            if (pnlPct <= -STOP_LOSS_PCT) {
              const pnl = t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price;
              return { ...t, exitPrice: price, exitTime: new Date(now).toLocaleTimeString(), pnl: pnl * (POSITION_SIZE / t.entryPrice), pnlPct, status: "CLOSED" as const, closedAt: now, reason: `${t.reason} → 🛑 SL ${pnlPct.toFixed(2)}%` };
            }
            if (holdTime >= MAX_HOLD_MS) {
              const pnl = t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price;
              return { ...t, exitPrice: price, exitTime: new Date(now).toLocaleTimeString(), pnl: pnl * (POSITION_SIZE / t.entryPrice), pnlPct, status: "CLOSED" as const, closedAt: now };
            }
            return t;
          });

          // Feed closed unfed trades to learner
          trades = trades.map(t => {
            if (t.status === "CLOSED" && !t.fedToLearner && t.exitPrice !== null && t.closedAt) {
              const holdSec = (t.closedAt - t.openedAt) / 1000;
              recordTradeOutcome(sym, t.direction, t.entryPrice, t.exitPrice, holdSec, (t.pnl || 0) > 0);
              return { ...t, fedToLearner: true };
            }
            return t;
          });

          // Try opening new trade
          if (now - lastTradeTime >= MIN_TRADE_GAP_MS) {
            const best = getBestPrediction(signals);
            if (best) {
              const openTrades = trades.filter(t => t.status === "OPEN");
              const lastOpen = openTrades[openTrades.length - 1];

              if (!lastOpen || lastOpen.direction !== best.direction) {
                // Close opposite immediately
                if (lastOpen) {
                  trades = trades.map(t => {
                    if (t.status === "OPEN") {
                      const pnl = t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price;
                      return { ...t, exitPrice: price, exitTime: new Date(now).toLocaleTimeString(), pnl: pnl * (POSITION_SIZE / t.entryPrice), pnlPct: (pnl / t.entryPrice) * 100, status: "CLOSED" as const, closedAt: now, fedToLearner: false };
                    }
                    return t;
                  });
                }

                const stillOpen = trades.filter(t => t.status === "OPEN").length;
                if (stillOpen === 0) {
                  lastTradeTime = now;
                  trades.push({
                    id: `${sym}-${now}`, symbol: sym, entryPrice: price, direction: best.direction,
                    exitPrice: null, exitTime: null, pnl: null, pnlPct: null, status: "OPEN", openedAt: now, closedAt: null,
                    reason: best.reason, confidence: best.confidence, fedToLearner: false,
                  });
                }
              }
            }
          }

          const finalTrades = trades.slice(-500);
          saveTrades(sym, finalTrades);
          next[sym] = { ...state, signals, trades: finalTrades, lastTradeTime };
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Aggregate metrics
  const aggregate = useMemo(() => {
    let totalPnl = 0, realized = 0, unrealized = 0, wins = 0, losses = 0, totalTrades = 0, openCount = 0;
    const perSymbol: { symbol: string; name: string; pnl: number; roi: number; wins: number; losses: number; trades: number; open: number; curr: string; lastDirection: string | null; price: number }[] = [];

    for (const s of Object.values(symbolStates)) {
      const curr = s.isIndian ? "₹" : "$";
      const closed = s.trades.filter(t => t.status === "CLOSED");
      const open = s.trades.filter(t => t.status === "OPEN");
      const symRealized = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const price = s.signals?.currentPrice || 0;
      const symUnrealized = open.reduce((sum, t) => {
        const pnl = t.direction === "LONG" ? (price - t.entryPrice) : (t.entryPrice - price);
        return sum + pnl * (POSITION_SIZE / t.entryPrice);
      }, 0);
      const symPnl = symRealized + symUnrealized;
      const symWins = closed.filter(t => (t.pnl || 0) > 0).length;
      const symLosses = closed.filter(t => (t.pnl || 0) <= 0).length;

      totalPnl += symPnl; realized += symRealized; unrealized += symUnrealized;
      wins += symWins; losses += symLosses; totalTrades += s.trades.length; openCount += open.length;

      if (s.trades.length > 0 || s.signals) {
        const lastOpen = open[open.length - 1];
        perSymbol.push({
          symbol: s.symbol, name: s.name, pnl: symPnl, roi: symPnl / 10000 * 100,
          wins: symWins, losses: symLosses, trades: s.trades.length, open: open.length,
          curr, lastDirection: lastOpen?.direction || null, price,
        });
      }
    }
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
    return { totalPnl, realized, unrealized, wins, losses, winRate, totalTrades, openCount, perSymbol: perSymbol.sort((a, b) => b.pnl - a.pnl) };
  }, [symbolStates, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = Object.values(symbolStates).filter(s => s.signals).length;

  // Recent trade feed across all symbols
  const recentTrades = useMemo(() => {
    return Object.values(symbolStates)
      .flatMap(s => s.trades.filter(t => t.status === "CLOSED").map(t => ({ ...t, symbol: s.symbol, curr: s.isIndian ? "₹" : "$" })))
      .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
      .slice(0, 50);
  }, [symbolStates, tick]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <Brain className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-sm text-muted-foreground">
                Auto-trading {TOP_SYMBOLS.length} symbols · Recursive learning · Never stops
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
            </span>
            <span className="text-xs font-medium text-chart-2">LIVE</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-mono text-primary">{activeCount}/{TOP_SYMBOLS.length} active</span>
            <span className="rounded-full bg-chart-2/10 px-3 py-1 text-xs font-mono text-chart-2">{aggregate.totalTrades} trades</span>
          </div>
        </div>

        {/* Aggregate P&L */}
        <div className={`mb-4 rounded-2xl border-2 p-4 ${aggregate.totalPnl >= 0 ? "border-chart-2/40 bg-chart-2/5 shadow-[0_0_20px_-5px_hsl(var(--chart-2)/0.3)]" : "border-destructive/40 bg-destructive/5 shadow-[0_0_20px_-5px_hsl(var(--destructive)/0.3)]"}`}>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Portfolio P&L · All Auto-Traders</h3>
            <Brain className="h-4 w-4 text-primary/60" />
            <span className="text-[10px] text-muted-foreground">Self-improving · $1K/trade · TP 0.15% · SL 0.20%</span>
            <span className="ml-auto relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] text-primary font-medium">LIVE</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 mb-3">
            <div className={`rounded-lg border p-2.5 text-center relative overflow-hidden ${aggregate.totalPnl >= 0 ? "border-chart-2/50 bg-chart-2/10" : "border-destructive/50 bg-destructive/10"}`}>
              {aggregate.totalPnl > 0 && <div className="absolute inset-0 bg-gradient-to-t from-chart-2/10 to-chart-2/5 pointer-events-none" />}
              <div className="relative text-[9px] uppercase text-muted-foreground">Total P&L</div>
              <div className={`relative text-xl font-bold font-mono ${aggregate.totalPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                {aggregate.totalPnl >= 0 ? "+" : ""}${aggregate.totalPnl.toFixed(2)}
              </div>
            </div>
            <div className={`rounded-lg border p-2.5 text-center ${aggregate.realized >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
              <div className="text-[9px] uppercase text-muted-foreground">Realized</div>
              <div className={`text-lg font-bold font-mono ${aggregate.realized >= 0 ? "text-chart-2" : "text-destructive"}`}>
                {aggregate.realized >= 0 ? "+" : ""}${aggregate.realized.toFixed(2)}
              </div>
            </div>
            <div className={`rounded-lg border p-2.5 text-center ${aggregate.unrealized >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
              <div className="text-[9px] uppercase text-muted-foreground">Unrealized</div>
              <div className={`text-sm font-bold font-mono ${aggregate.unrealized >= 0 ? "text-chart-2" : "text-destructive"}`}>
                {aggregate.unrealized >= 0 ? "+" : ""}${aggregate.unrealized.toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Win Rate</div>
              <div className="text-lg font-bold font-mono text-primary">{aggregate.winRate.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">{aggregate.wins}W / {aggregate.losses}L</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Total Trades</div>
              <div className="text-lg font-bold font-mono text-foreground">{aggregate.totalTrades}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
              <div className="text-[9px] uppercase text-muted-foreground">Open Now</div>
              <div className="text-lg font-bold font-mono text-primary">{aggregate.openCount}</div>
              <div className="text-[9px] text-muted-foreground">{TOP_SYMBOLS.length} symbols</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: Per-symbol auto-trader cards */}
          <div className="lg:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {aggregate.perSymbol.map(s => {
                const state = symbolStates[s.symbol];
                const openTrade = state?.trades.find(t => t.status === "OPEN");
                const stats = getAccuracyStats(s.symbol);
                const livePnl = openTrade ? (
                  openTrade.direction === "LONG"
                    ? (s.price - openTrade.entryPrice) * (POSITION_SIZE / openTrade.entryPrice)
                    : (openTrade.entryPrice - s.price) * (POSITION_SIZE / openTrade.entryPrice)
                ) : 0;

                return (
                  <button
                    key={s.symbol}
                    onClick={() => navigate(`/options?symbol=${s.symbol}`)}
                    className={`rounded-xl border-2 bg-card p-3 text-left transition-all hover:shadow-md cursor-pointer ${
                      s.pnl >= 0 ? "border-chart-2/20 hover:border-chart-2/50" : "border-destructive/20 hover:border-destructive/50"
                    }`}
                  >
                    {/* Symbol header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{s.symbol}</span>
                        {state?.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                      {s.price > 0 && (
                        <span className="text-sm font-bold font-mono text-foreground">{s.curr}{s.price.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mb-2">{s.name}</div>

                    {/* P&L row */}
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      <div className={`rounded-md border p-1.5 text-center ${s.pnl >= 0 ? "border-chart-2/30 bg-chart-2/5" : "border-destructive/30 bg-destructive/5"}`}>
                        <div className="text-[8px] uppercase text-muted-foreground">P&L</div>
                        <div className={`text-xs font-bold font-mono ${s.pnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                          {s.pnl >= 0 ? "+" : ""}{s.curr}{s.pnl.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-1.5 text-center">
                        <div className="text-[8px] uppercase text-muted-foreground">Win</div>
                        <div className="text-xs font-bold font-mono text-primary">
                          {(s.wins + s.losses) > 0 ? ((s.wins / (s.wins + s.losses)) * 100).toFixed(0) : 0}%
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-1.5 text-center">
                        <div className="text-[8px] uppercase text-muted-foreground">Trades</div>
                        <div className="text-xs font-bold font-mono text-foreground">{s.trades}</div>
                      </div>
                    </div>

                    {/* Open position */}
                    {openTrade ? (
                      <div className={`rounded-lg border p-1.5 ${livePnl >= 0 ? "border-chart-2/30 bg-chart-2/5" : "border-destructive/30 bg-destructive/5"}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${openTrade.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                            {openTrade.direction}
                          </span>
                          <span className="text-[9px] font-mono text-foreground">@ {s.curr}{openTrade.entryPrice.toFixed(2)}</span>
                          <span className="ml-auto flex items-center gap-0.5">
                            {livePnl >= 0 ? <ArrowUpRight className="h-3 w-3 text-chart-2" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                            <span className={`text-[10px] font-bold font-mono ${livePnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                              {livePnl >= 0 ? "+" : ""}{s.curr}{livePnl.toFixed(2)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/40 transition-all"
                              style={{ width: `${Math.min(100, ((Date.now() - openTrade.openedAt) / MAX_HOLD_MS) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[8px] text-muted-foreground">{Math.floor((Date.now() - openTrade.openedAt) / 1000)}s</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-1.5 text-center text-[9px] text-muted-foreground flex items-center justify-center gap-1">
                        <Activity className="h-3 w-3" /> Scanning for entry…
                      </div>
                    )}

                    {/* Learning stats */}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
                        <Brain className="h-2.5 w-2.5" /> Acc: {stats.overall.toFixed(0)}% ({stats.total}p)
                      </span>
                      <span className="text-[9px] text-primary flex items-center gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> Details
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Live trade feed */}
          <div className="rounded-2xl border-2 border-primary/20 bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Live Trade Feed
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
                </span>
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Closed trades across all auto-traders · Learning from every outcome</p>
            </div>
            <ScrollArea className="h-[70vh]">
              <div className="p-3 space-y-1.5">
                {recentTrades.length === 0 ? (
                  <div className="py-16 text-center">
                    <Zap className="mx-auto mb-2 h-8 w-8 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No trades closed yet.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Auto-traders are scanning and trading — results appear here after 1–10m hold.</p>
                  </div>
                ) : (
                  recentTrades.map((t, i) => (
                    <div
                      key={`${t.id}-${i}`}
                      className={`rounded-lg border p-2 ${
                        (t.pnl || 0) >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground w-10">{t.symbol}</span>
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${t.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                          {t.direction}
                        </span>
                        <span className="text-[9px] font-mono text-foreground">{t.curr}{t.entryPrice.toFixed(2)}</span>
                        <span className="text-muted-foreground text-[9px]">→</span>
                        <span className="text-[9px] font-mono text-foreground">{t.curr}{t.exitPrice?.toFixed(2)}</span>
                        <span className={`ml-auto text-xs font-bold font-mono ${(t.pnl || 0) >= 0 ? "text-chart-2" : "text-destructive"}`}>
                          {(t.pnl || 0) >= 0 ? "+" : ""}{t.curr}{t.pnl?.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[8px] text-muted-foreground truncate flex-1">{t.reason}</span>
                        {t.fedToLearner && <Brain className="h-2.5 w-2.5 text-primary/50" />}
                        <span className="text-[8px] text-muted-foreground">
                          {t.closedAt ? `${Math.floor(((t.closedAt - t.openedAt) / 1000))}s hold` : ""}
                        </span>
                      </div>
                    </div>
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
