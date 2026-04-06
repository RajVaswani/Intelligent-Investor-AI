import { useState, useEffect, useRef, useMemo } from "react";
import { DollarSign, TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";
import type { HighConvictionEntry } from "./HighConvictionSignals";

interface Trade {
  id: string;
  entrySignal: HighConvictionEntry;
  entryPrice: number;
  direction: "LONG" | "SHORT";
  exitPrice: number | null;
  exitTime: string | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "OPEN" | "CLOSED";
  closedAt: number | null;
}

interface Props {
  history: HighConvictionEntry[];
  currentPrice: number;
  currency: string;
}

const STARTING_CAPITAL = 10000;
const POSITION_SIZE = 1000; // $1000 per trade

export function AutoTradeSimulator({ history, currentPrice, currency }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const processedRef = useRef<Set<number>>(new Set());

  // Process new signals into trades
  useEffect(() => {
    if (history.length === 0) return;

    setTrades(prev => {
      let updated = [...prev];

      // Close opposite trades when new signal fires
      for (const signal of history) {
        if (processedRef.current.has(signal.timestamp)) continue;
        processedRef.current.add(signal.timestamp);

        const newDirection = signal.signal === "BUY" ? "LONG" : "SHORT";

        // Close any open trades in opposite direction
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

        // Open new trade
        updated.push({
          id: `trade-${signal.timestamp}`,
          entrySignal: signal,
          entryPrice: signal.price,
          direction: newDirection,
          exitPrice: null,
          exitTime: null,
          pnl: null,
          pnlPct: null,
          status: "OPEN",
          closedAt: null,
        });
      }

      return updated.slice(-100);
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
        <p className="text-xs text-muted-foreground">Auto-trade simulator will start when signals fire</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Virtual {currency}{STARTING_CAPITAL.toLocaleString()} capital · {currency}{POSITION_SIZE} per trade</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* P&L Dashboard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </div>

      {/* Capital bar */}
      <div className="rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase text-muted-foreground">Capital</span>
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
          <span className="text-[9px] text-muted-foreground">Realized: {metrics.realizedPnl >= 0 ? "+" : ""}{currency}{metrics.realizedPnl.toFixed(2)}</span>
          <span className="text-[9px] text-muted-foreground">Unrealized: {metrics.unrealizedPnl >= 0 ? "+" : ""}{currency}{metrics.unrealizedPnl.toFixed(2)}</span>
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
                    <span className="text-[9px] text-muted-foreground">{t.entrySignal.time}</span>
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
          <DollarSign className="h-3 w-3" /> Trade Log
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {[...trades].reverse().slice(0, 20).map(t => {
            const isClosed = t.status === "CLOSED";
            return (
              <div key={t.id} className={`rounded-md border p-1.5 flex items-center gap-2 text-[10px] ${
                isClosed
                  ? (t.pnl || 0) >= 0 ? "border-chart-2/15 bg-chart-2/5" : "border-destructive/15 bg-destructive/5"
                  : "border-primary/15 bg-primary/5"
              }`}>
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
