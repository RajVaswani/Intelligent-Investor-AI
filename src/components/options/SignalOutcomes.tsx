import { useState, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { HighConvictionEntry } from "./HighConvictionSignals";

interface OutcomeCheck {
  minutes: number;
  priceAtCheck: number | null;
  pnl: number | null;
  pnlPct: number | null;
  win: boolean | null; // null = pending
  checkedAt: number | null;
}

export interface SignalOutcome {
  entry: HighConvictionEntry;
  checks: OutcomeCheck[];
}

interface Props {
  history: HighConvictionEntry[];
  currentPrice: number;
  currency: string;
}

const CHECKPOINTS = [1, 5, 10]; // minutes

export function SignalOutcomes({ history, currentPrice, currency }: Props) {
  const [outcomes, setOutcomes] = useState<SignalOutcome[]>([]);

  // Update outcomes whenever history or price changes
  useEffect(() => {
    if (history.length === 0) return;
    const now = Date.now();

    setOutcomes(prev => {
      // Add new signals not yet tracked
      const existing = new Set(prev.map(o => o.entry.timestamp));
      const newEntries: SignalOutcome[] = history
        .filter(h => !existing.has(h.timestamp))
        .map(h => ({
          entry: h,
          checks: CHECKPOINTS.map(m => ({
            minutes: m,
            priceAtCheck: null,
            pnl: null,
            pnlPct: null,
            win: null,
            checkedAt: null,
          })),
        }));

      const merged = [...prev, ...newEntries];

      // Update pending checks with current price if time has elapsed
      return merged.map(outcome => ({
        ...outcome,
        checks: outcome.checks.map(check => {
          if (check.win !== null) return check; // already resolved
          const elapsed = (now - outcome.entry.timestamp) / 60000;
          if (elapsed >= check.minutes) {
            const entryPrice = outcome.entry.price;
            const pnl = outcome.entry.signal === "BUY"
              ? currentPrice - entryPrice
              : entryPrice - currentPrice;
            const pnlPct = (pnl / entryPrice) * 100;
            return {
              ...check,
              priceAtCheck: currentPrice,
              pnl,
              pnlPct,
              win: pnl > 0,
              checkedAt: now,
            };
          }
          return check;
        }),
      })).slice(-30); // keep last 30
    });
  }, [history, currentPrice]);

  if (outcomes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-center">
        <Clock className="mx-auto mb-1 h-5 w-5 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground">Signal outcomes will appear here after conviction signals fire</p>
      </div>
    );
  }

  const allResolved = outcomes.flatMap(o => o.checks).filter(c => c.win !== null);
  const totalWins = allResolved.filter(c => c.win === true).length;
  const totalLosses = allResolved.filter(c => c.win === false).length;
  const winRate = allResolved.length > 0 ? ((totalWins / allResolved.length) * 100).toFixed(1) : "—";

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-2 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Wins</div>
          <div className="text-lg font-bold font-mono text-chart-2">{totalWins}</div>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Losses</div>
          <div className="text-lg font-bold font-mono text-destructive">{totalLosses}</div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Win Rate</div>
          <div className="text-lg font-bold font-mono text-primary">{winRate}%</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
          <div className="text-[9px] uppercase text-muted-foreground">Pending</div>
          <div className="text-lg font-bold font-mono text-muted-foreground">
            {outcomes.flatMap(o => o.checks).filter(c => c.win === null).length}
          </div>
        </div>
      </div>

      {/* Individual signal outcomes */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {[...outcomes].reverse().map((outcome, idx) => {
          const isBuy = outcome.entry.signal === "BUY";
          return (
            <div
              key={outcome.entry.timestamp}
              className={`rounded-lg border p-2.5 ${
                isBuy ? "border-chart-2/20 bg-chart-2/5" : "border-destructive/20 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold ${isBuy ? "text-chart-2" : "text-destructive"}`}>
                  {outcome.entry.signal}
                </span>
                <span className="text-[10px] font-mono text-foreground">
                  @ {currency}{outcome.entry.price.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{outcome.entry.time}</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {outcome.checks.map(check => {
                  const elapsed = (Date.now() - outcome.entry.timestamp) / 60000;
                  const progress = check.win === null ? Math.min((elapsed / check.minutes) * 100, 100) : 100;

                  return (
                    <div
                      key={check.minutes}
                      className={`rounded-md border p-1.5 text-center ${
                        check.win === true
                          ? "border-chart-2/40 bg-chart-2/10"
                          : check.win === false
                          ? "border-destructive/40 bg-destructive/10"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <div className="text-[9px] font-medium text-muted-foreground mb-0.5">
                        {check.minutes} min
                      </div>

                      {check.win !== null ? (
                        <>
                          <div className="flex items-center justify-center gap-0.5">
                            {check.win ? (
                              <CheckCircle2 className="h-3 w-3 text-chart-2" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive" />
                            )}
                            <span className={`text-[10px] font-bold ${check.win ? "text-chart-2" : "text-destructive"}`}>
                              {check.win ? "WIN" : "LOSS"}
                            </span>
                          </div>
                          <div className={`text-[9px] font-mono ${check.pnl! >= 0 ? "text-chart-2" : "text-destructive"}`}>
                            {check.pnl! >= 0 ? "+" : ""}{currency}{check.pnl!.toFixed(2)}
                            <span className="text-muted-foreground ml-0.5">
                              ({check.pnlPct! >= 0 ? "+" : ""}{check.pnlPct!.toFixed(2)}%)
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-center gap-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />
                            <span className="text-[10px] text-muted-foreground">
                              {Math.max(0, Math.ceil(check.minutes - elapsed))}m
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/50 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
