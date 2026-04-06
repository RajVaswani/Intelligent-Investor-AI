import { useState, useEffect, useRef, useMemo } from "react";
import { DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Wallet, Zap } from "lucide-react";
import type { HighConvictionEntry } from "./HighConvictionSignals";
import type { LiveSignals } from "@/lib/signalEngine";

interface Trade {
  id: string;
  entryPrice: number;
  direction: "LONG" | "SHORT";
  exitPrice: number | null;
  exitTime: string | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "OPEN" | "CLOSED";
  closedAt: number | null;
  reason: string;
  confidence: number;
}

interface Props {
  history: HighConvictionEntry[];
  currentPrice: number;
  currency: string;
  signals?: LiveSignals | null;
}

const STARTING_CAPITAL = 10000;
const POSITION_SIZE = 1000;
const MIN_TRADE_GAP_MS = 5000; // 5s gap between trades

function getBestPrediction(signals: LiveSignals): { direction: "LONG" | "SHORT"; confidence: number; reason: string } | null {
  const preds = signals.predictions;
  if (!preds || preds.length === 0) return null;

  // Count directional votes weighted by confidence
  let buyScore = 0, sellScore = 0, holdScore = 0;
  for (const p of preds) {
    if (p.signal === "STRONG BUY") buyScore += p.confidence * 1.5;
    else if (p.signal === "BUY") buyScore += p.confidence;
    else if (p.signal === "STRONG SELL") sellScore += p.confidence * 1.5;
    else if (p.signal === "SELL") sellScore += p.confidence;
    else holdScore += p.confidence;
  }

  const total = buyScore + sellScore + holdScore;
  if (total === 0) return null;

  const buyPct = (buyScore / total) * 100;
  const sellPct = (sellScore / total) * 100;

  // Need at least 55% directional consensus to act
  if (buyPct > 55) {
    const avgConf = Math.round(buyScore / preds.filter(p => p.signal === "STRONG BUY" || p.signal === "BUY").length || 50);
    return { direction: "LONG", confidence: Math.min(avgConf, 99), reason: `${preds.filter(p => p.signal === "STRONG BUY" || p.signal === "BUY").length}/${preds.length} TFs bullish (${buyPct.toFixed(0)}%)` };
  }
  if (sellPct > 55) {
    const avgConf = Math.round(sellScore / preds.filter(p => p.signal === "STRONG SELL" || p.signal === "SELL").length || 50);
    return { direction: "SHORT", confidence: Math.min(avgConf, 99), reason: `${preds.filter(p => p.signal === "STRONG SELL" || p.signal === "SELL").length}/${preds.length} TFs bearish (${sellPct.toFixed(0)}%)` };
  }

  return null; // mixed signals - hold
}

export function AutoTradeSimulator({ history, currentPrice, currency, signals }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const lastTradeTimeRef = useRef<number>(0);
  const processedConvictionRef = useRef<Set<number>>(new Set());

  // Process live signals every tick - trade on best prediction
  useEffect(() => {
    if (!signals || currentPrice <= 0) return;
    const now = Date.now();
    if (now - lastTradeTimeRef.current < MIN_TRADE_GAP_MS) return;

    if (!best) return;

    setTrades(prev => {
      const openTrades = prev.filter(t => t.status === "OPEN");
      const lastOpen = openTrades[openTrades.length - 1];

      // If already have an open trade in same direction, skip
      if (lastOpen && lastOpen.direction === best.direction) return prev;

      let updated = [...prev];

      // Close opposite open trades
      updated = updated.map(t => {
        if (t.status === "OPEN" && t.direction !== best.direction) {
          const pnl = t.direction === "LONG"
            ? currentPrice - t.entryPrice
            : t.entryPrice - currentPrice;
          const pnlPct = (pnl / t.entryPrice) * 100;
          return {
            ...t,
            exitPrice: currentPrice,
            exitTime: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            pnl: pnl * (POSITION_SIZE / t.entryPrice),
            pnlPct,
            status: "CLOSED" as const,
            closedAt: now,
          };
        }
        return t;
      });

      // Open new trade
      lastTradeTimeRef.current = now;
      updated.push({
        id: `trade-${now}`,
        entryPrice: currentPrice,
        direction: best.direction,
        exitPrice: null,
        exitTime: null,
        pnl: null,
        pnlPct: null,
        status: "OPEN",
        closedAt: null,
        reason: best.reason,
        confidence: best.confidence,
      });

      return updated.slice(-200);
    });
  }, [signals, currentPrice]);

  // Also process conviction signals (higher priority trades)
  useEffect(() => {
    if (history.length === 0) return;

    setTrades(prev => {
      let updated = [...prev];

      for (const signal of history) {
        if (processedConvictionRef.current.has(signal.timestamp)) continue;
        processedConvictionRef.current.add(signal.timestamp);

        const newDirection = signal.signal === "BUY" ? "LONG" : "SHORT";

        // Close opposite
        updated = updated.map(t => {
          if (t.status === "OPEN" && t.direction !== newDirection) {
            const pnl = t.direction === "LONG"
              ? currentPrice - t.entryPrice
              : t.entryPrice - currentPrice;
            const pnlPct = (pnl / t.entryPrice) * 100;
            return {
              ...t,
              exitPrice: currentPrice,
              exitTime: signal.time,
              pnl: pnl * (POSITION_SIZE / t.entryPrice),
              pnlPct,
              status: "CLOSED" as const,
              closedAt: signal.timestamp,
            };
          }
          return t;
        });

        lastTradeTimeRef.current = signal.timestamp;
        updated.push({
          id: `conv-${signal.timestamp}`,
          entryPrice: signal.price,
          direction: newDirection,
          exitPrice: null,
          exitTime: null,
          pnl: null,
          pnlPct: null,
          status: "OPEN",
          closedAt: null,
          reason: `⚡ Conviction: ${signal.reasons[0] || "All indicators aligned"}`,
          confidence: signal.confidence,
        });
      }

      return updated.slice(-200);
    });
  }, [history, currentPrice]);

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

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
        <Wallet className="mx-auto mb-1 h-6 w-6 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">Auto-trader active — waiting for directional consensus</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Trades on best prediction (55%+ consensus) · No conviction wait · {currency}{STARTING_CAPITAL.toLocaleString()} capital</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* P&L Dashboard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className={`rounded-lg border p-2.5 text-center ${metrics.totalPnl >= 0 ? "border-chart-2/30 bg-chart-2/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="text-[9px] uppercase text-muted-foreground">Total P&L</div>
          <div className={`text-lg font-bold font-mono ${metrics.totalPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
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
          <span className="text-[9px] text-muted-foreground">Mode: Best Prediction (55%+ consensus)</span>
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

              return (
                <div key={t.id} className={`rounded-lg border p-2 ${livePnl >= 0 ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                      {t.direction}
                    </span>
                    <span className="text-[10px] font-mono text-foreground">@ {currency}{t.entryPrice.toFixed(2)}</span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-[150px]">{t.reason}</span>
                    <span className="ml-auto flex items-center gap-0.5">
                      {livePnl >= 0 ? <ArrowUpRight className="h-3 w-3 text-chart-2" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                      <span className={`text-xs font-bold font-mono ${livePnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                        {livePnl >= 0 ? "+" : ""}{currency}{livePnl.toFixed(2)} ({livePct >= 0 ? "+" : ""}{livePct.toFixed(2)}%)
                      </span>
                    </span>
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
            return (
              <div key={t.id} className={`rounded-md border p-1.5 flex items-center gap-2 text-[10px] ${
                isClosed
                  ? (t.pnl || 0) >= 0 ? "border-chart-2/15 bg-chart-2/5" : "border-destructive/15 bg-destructive/5"
                  : "border-primary/15 bg-primary/5"
              }`}>
                {isConviction && <Zap className="h-3 w-3 text-primary" />}
                <span className={`font-bold px-1 py-0.5 rounded ${t.direction === "LONG" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                  {t.direction}
                </span>
                <span className="font-mono text-foreground">{currency}{t.entryPrice.toFixed(2)}</span>
                {isClosed && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-foreground">{currency}{t.exitPrice?.toFixed(2)}</span>
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
