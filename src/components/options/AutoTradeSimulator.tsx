import { useState, useEffect, useRef, useMemo } from "react";
import { DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Wallet, Zap, Clock, Brain } from "lucide-react";
import type { HighConvictionEntry } from "./HighConvictionSignals";
import type { LiveSignals } from "@/lib/signalEngine";
import { recordTradeOutcome, getLearnedWeights } from "@/lib/signalLearner";
import { loadTrades, saveTrades, type PersistedTrade } from "@/lib/tradeStore";

interface Props {
  history: HighConvictionEntry[];
  currentPrice: number;
  currency: string;
  signals?: LiveSignals | null;
  symbol?: string;
}

const STARTING_CAPITAL = 10000;
const POSITION_SIZE = 1000;
const MIN_HOLD_MS = 0;        // No minimum hold — book P&L immediately
const MAX_HOLD_MS = 300_000;   // 5 min safety net
const MIN_TRADE_GAP_MS = 1000; // 1 second between trades
const TAKE_PROFIT_PCT = 0.15;  // Book profit at 0.15%
const STOP_LOSS_PCT = 0.20;    // Cut loss at 0.20%

function getBestPrediction(signals: LiveSignals): { direction: "LONG" | "SHORT"; confidence: number; reason: string } | null {
  const preds = signals.predictions;
  if (!preds || preds.length === 0) return null;

  let bestPred = preds[0];
  for (const p of preds) {
    if (p.confidence > bestPred.confidence) bestPred = p;
  }

  const isBuy = bestPred.signal === "STRONG BUY" || bestPred.signal === "BUY";
  const isSell = bestPred.signal === "STRONG SELL" || bestPred.signal === "SELL";

  if (!isBuy && !isSell) {
    const actionable = preds.filter(p => p.signal !== "HOLD");
    if (actionable.length === 0) return null;
    const top = actionable.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const dir = top.signal === "STRONG BUY" || top.signal === "BUY" ? "LONG" : "SHORT";
    return { direction: dir, confidence: top.confidence, reason: `${top.signal} on ${top.label || "best TF"} (${top.confidence}% conf)` };
  }

  return {
    direction: isBuy ? "LONG" : "SHORT",
    confidence: bestPred.confidence,
    reason: `${bestPred.signal} on ${bestPred.label || "best TF"} (${bestPred.confidence}% conf)`,
  };
}

function closeTrade(t: PersistedTrade, price: number, now: number, reason?: string): PersistedTrade {
  const pnl = t.direction === "LONG" ? price - t.entryPrice : t.entryPrice - price;
  const pnlPct = (pnl / t.entryPrice) * 100;
  return {
    ...t,
    exitPrice: price,
    exitTime: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    pnl: pnl * (POSITION_SIZE / t.entryPrice),
    pnlPct,
    status: "CLOSED" as const,
    closedAt: now,
    reason: reason ? `${t.reason} → ${reason}` : t.reason,
  };
}

export function AutoTradeSimulator({ history, currentPrice, currency, signals, symbol = "SPY" }: Props) {
  // Load persisted trades on mount (key={symbol} ensures remount per symbol)
  const [trades, setTrades] = useState<PersistedTrade[]>(() => loadTrades(symbol));
  const [learningFeedback, setLearningFeedback] = useState<{ wins: number; losses: number }>(() => {
    const loaded = loadTrades(symbol);
    const fed = loaded.filter(t => t.fedToLearner && t.status === "CLOSED");
    return { wins: fed.filter(t => (t.pnl || 0) > 0).length, losses: fed.filter(t => (t.pnl || 0) <= 0).length };
  });
  const [_tick, setTick] = useState(0);
  const lastTradeTimeRef = useRef<number>(0);
  const processedConvictionRef = useRef<Set<number>>(new Set());

  // Tick every second so hold timers update smoothly
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Initialize refs on mount
  useEffect(() => {
    const loaded = loadTrades(symbol);
    for (const t of loaded) {
      if (t.id.startsWith("conv-")) {
        const ts = parseInt(t.id.replace("conv-", ""), 10);
        if (!isNaN(ts)) processedConvictionRef.current.add(ts);
      }
    }
    const latest = loaded.reduce((max, t) => Math.max(max, t.openedAt), 0);
    if (latest > 0) lastTradeTimeRef.current = latest;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist trades whenever they change
  useEffect(() => {
    saveTrades(symbol, trades);
  }, [trades, symbol]);

  // Auto-close: take-profit, stop-loss, and max hold
  useEffect(() => {
    if (currentPrice <= 0) return;
    const now = Date.now();

    setTrades(prev => {
      let changed = false;
      const updated = prev.map(t => {
        if (t.status !== "OPEN") return t;
        const pnlPct = t.direction === "LONG"
          ? ((currentPrice - t.entryPrice) / t.entryPrice) * 100
          : ((t.entryPrice - currentPrice) / t.entryPrice) * 100;
        const holdTime = now - t.openedAt;

        if (pnlPct >= TAKE_PROFIT_PCT) {
          changed = true;
          return closeTrade(t, currentPrice, now, `✅ Take profit +${pnlPct.toFixed(2)}%`);
        }
        if (pnlPct <= -STOP_LOSS_PCT) {
          changed = true;
          return closeTrade(t, currentPrice, now, `🛑 Stop loss ${pnlPct.toFixed(2)}%`);
        }
        if (holdTime >= MAX_HOLD_MS) {
          changed = true;
          return closeTrade(t, currentPrice, now, "⏱ Max hold");
        }
        return t;
      });
      return changed ? updated : prev;
    });
  }, [currentPrice]);

  // Feed closed trades into recursive learning
  useEffect(() => {
    setTrades(prev => {
      let changed = false;
      const updated = prev.map(t => {
        if (t.status === "CLOSED" && !t.fedToLearner && t.exitPrice !== null && t.closedAt) {
          changed = true;
          const holdSec = (t.closedAt - t.openedAt) / 1000;
          const wasProfit = (t.pnl || 0) > 0;
          recordTradeOutcome(symbol, t.direction, t.entryPrice, t.exitPrice, holdSec, wasProfit);
          setLearningFeedback(f => wasProfit ? { ...f, wins: f.wins + 1 } : { ...f, losses: f.losses + 1 });
          return { ...t, fedToLearner: true };
        }
        return t;
      });
      return changed ? updated : prev;
    });
  }, [trades, symbol]);

  // Process live signals — trade on best prediction
  useEffect(() => {
    if (!signals || currentPrice <= 0) return;
    const now = Date.now();
    if (now - lastTradeTimeRef.current < MIN_TRADE_GAP_MS) return;

    const best = getBestPrediction(signals);
    if (!best) return;

    setTrades(prev => {
      const openTrades = prev.filter(t => t.status === "OPEN");
      const lastOpen = openTrades[openTrades.length - 1];

      if (lastOpen && lastOpen.direction === best.direction) return prev;
      if (lastOpen && (now - lastOpen.openedAt) < MIN_HOLD_MS) return prev;

      let updated = [...prev];

      updated = updated.map(t => {
        if (t.status === "OPEN" && t.direction !== best.direction && (now - t.openedAt) >= MIN_HOLD_MS) {
          return closeTrade(t, currentPrice, now, "Signal flip");
        }
        return t;
      });

      const stillOpen = updated.filter(t => t.status === "OPEN");
      if (stillOpen.length > 0) return updated.slice(-500);

      lastTradeTimeRef.current = now;
      updated.push({
        id: `trade-${now}`,
        symbol,
        entryPrice: currentPrice,
        direction: best.direction,
        exitPrice: null,
        exitTime: null,
        pnl: null,
        pnlPct: null,
        status: "OPEN",
        closedAt: null,
        openedAt: now,
        reason: best.reason,
        confidence: best.confidence,
        fedToLearner: false,
      });

      return updated.slice(-500);
    });
  }, [signals, currentPrice, symbol]);

  // Conviction signals (higher priority — but still respect MIN_HOLD)
  useEffect(() => {
    if (history.length === 0) return;
    const now = Date.now();

    setTrades(prev => {
      let updated = [...prev];

      for (const signal of history) {
        if (processedConvictionRef.current.has(signal.timestamp)) continue;
        processedConvictionRef.current.add(signal.timestamp);

        const newDirection = signal.signal === "BUY" ? "LONG" : "SHORT";
        const openTrades = updated.filter(t => t.status === "OPEN");

        // Don't open if already holding same direction
        if (openTrades.some(t => t.direction === newDirection)) continue;

        // Close opposite trades only if past MIN_HOLD
        updated = updated.map(t => {
          if (t.status === "OPEN" && t.direction !== newDirection && (now - t.openedAt) >= MIN_HOLD_MS) {
            return closeTrade(t, currentPrice, now, "⚡ Conviction override");
          }
          return t;
        });

        // Only open new trade if no open positions remain
        const stillOpen = updated.filter(t => t.status === "OPEN");
        if (stillOpen.length > 0) continue;

        lastTradeTimeRef.current = signal.timestamp;
        updated.push({
          id: `conv-${signal.timestamp}`,
          symbol,
          entryPrice: signal.price,
          direction: newDirection as "LONG" | "SHORT",
          exitPrice: null,
          exitTime: null,
          pnl: null,
          pnlPct: null,
          status: "OPEN",
          closedAt: null,
          openedAt: signal.timestamp,
          reason: `⚡ Conviction: ${signal.reasons[0] || "All indicators aligned"}`,
          confidence: signal.confidence,
          fedToLearner: false,
        });
      }

      return updated.slice(-500);
    });
  }, [history, currentPrice, symbol]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === "CLOSED");
    const openTrades = trades.filter(t => t.status === "OPEN");

    const realizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const unrealizedPnl = openTrades.reduce((sum, t) => {
      const pnl = t.direction === "LONG"
        ? (currentPrice - t.entryPrice) * (POSITION_SIZE / t.entryPrice)
        : (t.entryPrice - currentPrice) * (POSITION_SIZE / t.entryPrice);
      return sum + pnl;
    }, 0);

    const totalPnl = realizedPnl + unrealizedPnl;
    const roi = (totalPnl / STARTING_CAPITAL) * 100;
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
    const losses = closedTrades.filter(t => (t.pnl || 0) <= 0).length;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;

    return { realizedPnl, unrealizedPnl, totalPnl, roi, wins, losses, winRate, openTrades, closedTrades, totalTrades: trades.length };
  }, [trades, currentPrice]);

  // Expose metrics globally for Options Master overview
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__autoTraderPnL = (window as any).__autoTraderPnL || {};
      (window as any).__autoTraderPnL[symbol] = {
        totalPnl: metrics.totalPnl,
        realizedPnl: metrics.realizedPnl,
        unrealizedPnl: metrics.unrealizedPnl,
        roi: metrics.roi,
        wins: metrics.wins,
        losses: metrics.losses,
        winRate: metrics.winRate,
        totalTrades: metrics.totalTrades,
        openTrades: metrics.openTrades.length,
        currency,
      };
    }
  }, [metrics, symbol, currency]);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
        <Wallet className="mx-auto mb-1 h-6 w-6 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">Auto-trader active — waiting for actionable signal</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Hold: 1–10 min · Feeds wins/losses to recursive learning · {currency}{STARTING_CAPITAL.toLocaleString()} capital</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* P&L Dashboard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className={`rounded-lg border p-2.5 text-center relative overflow-hidden ${metrics.totalPnl >= 0 ? "border-chart-2/50 bg-chart-2/10 shadow-[0_0_15px_-3px_hsl(var(--chart-2)/0.3)]" : "border-destructive/50 bg-destructive/10 shadow-[0_0_15px_-3px_hsl(var(--destructive)/0.3)]"}`}>
          {metrics.totalPnl > 0 && <div className="absolute inset-0 bg-gradient-to-t from-chart-2/10 to-chart-2/5 pointer-events-none" />}
          <div className="relative text-[9px] uppercase text-muted-foreground">Total P&L</div>
          <div className={`relative text-lg font-bold font-mono ${metrics.totalPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {metrics.totalPnl >= 0 ? "+" : ""}{currency}{metrics.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className={`rounded-lg border p-2.5 text-center ${metrics.roi >= 0 ? "border-chart-2/30 bg-chart-2/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="text-[9px] uppercase text-muted-foreground">ROI</div>
          <div className={`text-lg font-bold font-mono ${metrics.roi >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {metrics.roi >= 0 ? "+" : ""}{metrics.roi.toFixed(2)}%
          </div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Win Rate</div>
          <div className="text-lg font-bold font-mono text-primary">{metrics.winRate.toFixed(0)}%</div>
          <div className="text-[9px] text-muted-foreground">{metrics.wins}W / {metrics.losses}L</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Open</div>
          <div className="text-lg font-bold font-mono text-foreground">{metrics.openTrades.length}</div>
          <div className="text-[9px] text-muted-foreground">{metrics.totalTrades} total</div>
        </div>
        <div className={`rounded-lg border p-2.5 text-center ${metrics.realizedPnl >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
          <div className="text-[9px] uppercase text-muted-foreground">Realized</div>
          <div className={`text-sm font-bold font-mono ${metrics.realizedPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {metrics.realizedPnl >= 0 ? "+" : ""}{currency}{metrics.realizedPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Learning feedback bar */}
      {(learningFeedback.wins + learningFeedback.losses > 0) && (() => {
        const w = getLearnedWeights(symbol);
        return (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <div className="text-[9px] uppercase text-muted-foreground mb-0.5">Recursive Learning Engine — Live</div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-chart-2 font-mono font-bold">{learningFeedback.wins} wins → reinforced</span>
                  <span className="text-destructive font-mono font-bold">{learningFeedback.losses} losses → adjusted</span>
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground">
                <Clock className="h-3 w-3 inline mr-0.5" />
                1–10m hold
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: "RSI", val: w.rsi },
                { label: "EMA", val: w.ema },
                { label: "VWAP", val: w.vwap },
                { label: "Mom", val: w.momentum },
                { label: "Vol", val: w.volume },
                { label: "Fund", val: w.fundamental },
              ].map(ind => (
                <div key={ind.label} className="flex items-center gap-0.5 rounded bg-muted/50 px-1.5 py-0.5">
                  <span className="text-[8px] text-muted-foreground">{ind.label}</span>
                  <span className="text-[9px] font-mono font-bold text-primary">{(ind.val * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Capital bar */}
      <div className="rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3 text-primary" /> Active Trading Capital
          </span>
          <span className={`text-xs font-bold font-mono ${metrics.totalPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {currency}{(STARTING_CAPITAL + metrics.totalPnl).toFixed(2)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${metrics.totalPnl >= 0 ? "bg-chart-2" : "bg-destructive"}`}
            style={{ width: `${Math.min(100, Math.max(5, ((STARTING_CAPITAL + metrics.totalPnl) / STARTING_CAPITAL) * 50))}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground">Unrealized: {metrics.unrealizedPnl >= 0 ? "+" : ""}{currency}{metrics.unrealizedPnl.toFixed(2)}</span>
          <span className="text-[9px] text-muted-foreground">Self-learning · Profit-focused</span>
        </div>
      </div>

      {/* Open positions */}
      {metrics.openTrades.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Open Positions
          </div>
          <div className="space-y-1">
            {metrics.openTrades.map(t => {
              const livePnl = t.direction === "LONG"
                ? (currentPrice - t.entryPrice) * (POSITION_SIZE / t.entryPrice)
                : (t.entryPrice - currentPrice) * (POSITION_SIZE / t.entryPrice);
              const livePct = ((t.direction === "LONG" ? currentPrice - t.entryPrice : t.entryPrice - currentPrice) / t.entryPrice) * 100;
              const holdSec = Math.floor((Date.now() - t.openedAt) / 1000);
              const holdMin = Math.floor(holdSec / 60);
              const holdRemSec = holdSec % 60;
              const holdPct = Math.min(100, (holdSec / (MAX_HOLD_MS / 1000)) * 100);
              const underMin = holdSec < (MIN_HOLD_MS / 1000);

              return (
                <div key={t.id} className={`rounded-lg border p-2 ${livePnl >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                      {t.direction}
                    </span>
                    <span className="text-[10px] font-mono text-foreground">@ {currency}{t.entryPrice.toFixed(2)}</span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">{t.reason}</span>
                    <span className="ml-auto flex items-center gap-0.5">
                      {livePnl >= 0 ? <ArrowUpRight className="h-3 w-3 text-chart-2" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                      <span className={`text-xs font-bold font-mono ${livePnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                        {livePnl >= 0 ? "+" : ""}{currency}{livePnl.toFixed(2)} ({livePct >= 0 ? "+" : ""}{livePct.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className={`text-[9px] font-mono ${underMin ? "text-chart-4" : "text-muted-foreground"}`}>
                      {holdMin}:{holdRemSec.toString().padStart(2, "0")} {underMin ? "(min hold)" : ""}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${holdPct > 80 ? "bg-chart-4" : "bg-primary/40"}`}
                        style={{ width: `${holdPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">10m max</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade log */}
      <div>
        <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
          <DollarSign className="h-3 w-3" /> Trade Log ({trades.length} trades)
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {[...trades].reverse().slice(0, 30).map(t => {
            const isClosed = t.status === "CLOSED";
            const isConviction = t.id.startsWith("conv-");
            const holdSec = t.closedAt ? Math.floor((t.closedAt - t.openedAt) / 1000) : 0;
            return (
              <div key={t.id} className={`rounded-md border p-1.5 flex items-center gap-2 text-[10px] ${
                isClosed
                  ? (t.pnl || 0) >= 0 ? "border-chart-2/15 bg-chart-2/5" : "border-destructive/15 bg-destructive/5"
                  : "border-primary/15 bg-primary/5"
              }`}>
                {isConviction && <Zap className="h-3 w-3 text-primary" />}
                {t.fedToLearner && <Brain className="h-3 w-3 text-primary/50" />}
                <span className={`font-bold px-1 py-0.5 rounded ${t.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                  {t.direction}
                </span>
                <span className="font-mono text-foreground">{currency}{t.entryPrice.toFixed(2)}</span>
                {isClosed && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-foreground">{currency}{t.exitPrice?.toFixed(2)}</span>
                    <span className="text-[9px] text-muted-foreground">{holdSec}s</span>
                    <span className={`ml-auto font-bold font-mono ${(t.pnl || 0) >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {(t.pnl || 0) >= 0 ? "+" : ""}{currency}{t.pnl?.toFixed(2)}
                    </span>
                  </>
                )}
                {!isClosed && <span className="ml-auto text-primary font-medium">OPEN</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
