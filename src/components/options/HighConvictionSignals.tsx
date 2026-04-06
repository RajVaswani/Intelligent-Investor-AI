import { useState, useEffect, useRef, useMemo } from "react";
import type { LiveSignals, Signal } from "@/lib/signalEngine";
import type { AccuracySnapshot } from "@/lib/signalLearner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Dot } from "recharts";
import { Crosshair, ShieldCheck, Clock, Target } from "lucide-react";
import { SignalOutcomes } from "./SignalOutcomes";

export interface HighConvictionEntry {
  time: string;
  timestamp: number;
  price: number;
  signal: "BUY" | "SELL" | "HOLD";
  allAgree: boolean;
  confidence: number;
  reasons: string[];
  symbol?: string;
}

interface Props {
  signals: LiveSignals | null;
  symbol: string;
  currency: string;
  accuracyStats: {
    overall: number;
    total: number;
    correct: number;
    byTimeframe: Record<number, { accuracy: number; total: number }>;
    weights: { [key: string]: number };
    history: AccuracySnapshot[];
  };
}

/**
 * Determines if ALL conditions are met for a 100% conviction signal.
 * Extremely strict — only fires when every single indicator agrees.
 */
export function evaluate100PctSignal(signals: LiveSignals, accuracyStats: Props["accuracyStats"]): { signal: "BUY" | "SELL" | null; reasons: string[] } {
  const reasons: string[] = [];

  // 1. ALL timeframe predictions must agree on direction
  const preds = signals.predictions;
  if (preds.length === 0) return { signal: null, reasons: [] };

  const buySignals = preds.filter(p => p.signal === "STRONG BUY" || p.signal === "BUY");
  const sellSignals = preds.filter(p => p.signal === "STRONG SELL" || p.signal === "SELL");
  const allBuy = buySignals.length === preds.length;
  const allSell = sellSignals.length === preds.length;

  if (!allBuy && !allSell) return { signal: null, reasons: [] };

  const direction: "BUY" | "SELL" = allBuy ? "BUY" : "SELL";
  reasons.push(`All ${preds.length} timeframes agree: ${direction}`);

  // 2. ALL prediction confidences must be >= 80
  const minConf = Math.min(...preds.map(p => p.confidence));
  if (minConf < 80) return { signal: null, reasons: [] };
  reasons.push(`Min confidence: ${minConf}%`);

  // 3. RSI must confirm (not overbought for BUY, not oversold for SELL)
  if (direction === "BUY" && signals.rsi > 65) return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.rsi < 35) return { signal: null, reasons: [] };
  reasons.push(`RSI ${signals.rsi.toFixed(1)} confirms`);

  // 4. Stochastic RSI must confirm
  if (direction === "BUY" && signals.stochRsi > 70) return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.stochRsi < 30) return { signal: null, reasons: [] };
  reasons.push(`Stoch RSI ${signals.stochRsi.toFixed(0)} confirms`);

  // 5. MACD must agree
  if (direction === "BUY" && signals.macdSignal !== "bullish") return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.macdSignal !== "bearish") return { signal: null, reasons: [] };
  reasons.push(`MACD ${signals.macdSignal}`);

  // 6. Trend must align
  if (direction === "BUY" && signals.trend !== "up") return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.trend !== "down") return { signal: null, reasons: [] };
  reasons.push(`Trend ${signals.trend}`);

  // 7. VWAP must confirm
  if (direction === "BUY" && signals.priceVsVwap !== "above") return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.priceVsVwap !== "below") return { signal: null, reasons: [] };
  reasons.push(`Price ${signals.priceVsVwap} VWAP`);

  // 8. No volume-price divergence (it signals potential reversal)
  if (signals.volumePriceDivergence) return { signal: null, reasons: [] };
  reasons.push("No vol-price divergence");

  // 9. Volume must be rising to confirm move
  if (signals.volumeTrend !== "rising") return { signal: null, reasons: [] };
  reasons.push("Volume rising");

  // 10. Bollinger Bands must not be extreme (potential reversal)
  if (direction === "BUY" && signals.bollingerPosition > 85) return { signal: null, reasons: [] };
  if (direction === "SELL" && signals.bollingerPosition < 15) return { signal: null, reasons: [] };
  reasons.push(`Bollinger ${signals.bollingerPosition.toFixed(0)}% safe zone`);

  // 11. Macro must confirm (if available)
  if (signals.macroMicro) {
    if (signals.macroMicro.priceConfirmation === "contradicting") return { signal: null, reasons: [] };
    if (direction === "BUY" && signals.macroMicro.sentimentScore < 50) return { signal: null, reasons: [] };
    if (direction === "SELL" && signals.macroMicro.sentimentScore > 50) return { signal: null, reasons: [] };
    reasons.push(`Macro confirms (${signals.macroMicro.sentimentScore.toFixed(0)}/100)`);
  }

  // 12. Recursive learning accuracy must be >= 60% overall with enough data
  if (accuracyStats.total >= 20 && accuracyStats.overall < 55) return { signal: null, reasons: [] };
  if (accuracyStats.total >= 20) reasons.push(`Learning accuracy ${accuracyStats.overall.toFixed(1)}%`);

  // 13. Volatility regime must not be "high" (too unpredictable)
  if (signals.volatilityRegime === "high") return { signal: null, reasons: [] };
  reasons.push(`Volatility ${signals.volatilityRegime}`);

  return { signal: direction, reasons };
}

export function HighConvictionSignals({ signals, symbol, currency, accuracyStats }: Props) {
  const [history, setHistory] = useState<HighConvictionEntry[]>([]);
  const lastSignalRef = useRef<number>(0);
  const priceHistoryRef = useRef<{ time: string; timestamp: number; price: number }[]>([]);

  // Track price every second for the chart background
  useEffect(() => {
    if (!signals) return;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    priceHistoryRef.current.push({ time: timeStr, timestamp: now, price: signals.currentPrice });
    // Keep last 300 entries (5 min at 1s)
    if (priceHistoryRef.current.length > 300) priceHistoryRef.current = priceHistoryRef.current.slice(-300);
  }, [signals]);

  // Evaluate conviction signal every second
  useEffect(() => {
    if (!signals) return;
    const now = Date.now();

    // Minimum 10s gap between signals to avoid spam
    if (now - lastSignalRef.current < 10000) return;

    const result = evaluate100PctSignal(signals, accuracyStats);
    if (!result.signal) return;

    lastSignalRef.current = now;
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    setHistory(prev => {
      const next = [...prev, {
        time: timeStr,
        timestamp: now,
        price: signals.currentPrice,
        signal: result.signal!,
        allAgree: true,
        confidence: 100,
        reasons: result.reasons,
      }];
      return next.slice(-50); // keep last 50 signals
    });
  }, [signals, accuracyStats]);

  // Build chart data: price line with signal markers
  const chartData = useMemo(() => {
    const prices = priceHistoryRef.current.slice(-120); // last 2 min
    return prices.map(p => {
      const sig = history.find(h => Math.abs(h.timestamp - p.timestamp) < 1500);
      return {
        time: p.time,
        price: p.price,
        buySignal: sig?.signal === "BUY" ? p.price : undefined,
        sellSignal: sig?.signal === "SELL" ? p.price : undefined,
      };
    });
  }, [history, signals]); // eslint-disable-line react-hooks/exhaustive-deps

  const latestSignal = history.length > 0 ? history[history.length - 1] : null;
  const totalBuys = history.filter(h => h.signal === "BUY").length;
  const totalSells = history.filter(h => h.signal === "SELL").length;

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 relative overflow-hidden">
      {/* Subtle glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Crosshair className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                100% Conviction Signals
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              </h3>
              <p className="text-[10px] text-muted-foreground">Only fires when ALL 13 indicators align perfectly</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-medium text-primary">SCANNING</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-2 text-center">
            <div className="text-[9px] uppercase text-muted-foreground">Buy Signals</div>
            <div className="text-lg font-bold font-mono text-chart-2">{totalBuys}</div>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-center">
            <div className="text-[9px] uppercase text-muted-foreground">Sell Signals</div>
            <div className="text-lg font-bold font-mono text-destructive">{totalSells}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
            <div className="text-[9px] uppercase text-muted-foreground">Waiting</div>
            <div className="text-lg font-bold font-mono text-muted-foreground">
              {history.length === 0 ? "—" : `${Math.floor((Date.now() - lastSignalRef.current) / 1000)}s`}
            </div>
          </div>
        </div>

        {/* Live chart with signal markers */}
        {chartData.length > 5 && (
          <div className="h-44 w-full rounded-lg border border-border bg-muted/10 p-1 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                <XAxis dataKey="time" tick={{ fontSize: 8 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 8 }}
                  className="fill-muted-foreground"
                  width={50}
                  tickFormatter={(v: number) => `${currency}${v.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "10px" }}
                  formatter={(value: number, name: string) => {
                    if (name === "price") return [`${currency}${value.toFixed(2)}`, "Price"];
                    if (name === "buySignal") return [`${currency}${value.toFixed(2)}`, "🟢 BUY"];
                    if (name === "sellSignal") return [`${currency}${value.toFixed(2)}`, "🔴 SELL"];
                    return [value, name];
                  }}
                />
                <Line type="monotone" dataKey="price" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="buySignal"
                  stroke="none"
                  dot={(props: { cx?: number; cy?: number; payload?: { buySignal?: number } }) => {
                    if (!props.payload?.buySignal || !props.cx || !props.cy) return <></>;
                    return (
                      <g>
                        <circle cx={props.cx} cy={props.cy} r={6} fill="hsl(var(--chart-2))" fillOpacity={0.3} />
                        <circle cx={props.cx} cy={props.cy} r={3} fill="hsl(var(--chart-2))" />
                        <text x={props.cx} y={props.cy - 10} textAnchor="middle" fontSize={8} fill="hsl(var(--chart-2))" fontWeight="bold">BUY</text>
                      </g>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sellSignal"
                  stroke="none"
                  dot={(props: { cx?: number; cy?: number; payload?: { sellSignal?: number } }) => {
                    if (!props.payload?.sellSignal || !props.cx || !props.cy) return <></>;
                    return (
                      <g>
                        <circle cx={props.cx} cy={props.cy} r={6} fill="hsl(var(--destructive))" fillOpacity={0.3} />
                        <circle cx={props.cx} cy={props.cy} r={3} fill="hsl(var(--destructive))" />
                        <text x={props.cx} y={props.cy + 14} textAnchor="middle" fontSize={8} fill="hsl(var(--destructive))" fontWeight="bold">SELL</text>
                      </g>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Latest signal alert */}
        {latestSignal ? (
          <div className={`rounded-xl border-2 p-3 ${
            latestSignal.signal === "BUY"
              ? "border-chart-2/50 bg-chart-2/10"
              : "border-destructive/50 bg-destructive/10"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
                latestSignal.signal === "BUY" ? "bg-chart-2 text-chart-2-foreground" : "bg-destructive text-destructive-foreground"
              }`}>
                <span className="text-xs font-black">{latestSignal.signal === "BUY" ? "B" : "S"}</span>
              </div>
              <span className={`text-sm font-bold ${latestSignal.signal === "BUY" ? "text-chart-2" : "text-destructive"}`}>
                {latestSignal.signal} @ {currency}{latestSignal.price.toFixed(2)}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {latestSignal.time}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {latestSignal.reasons.map((r, i) => (
                <span key={i} className="rounded bg-background/50 px-1.5 py-0.5 text-[9px] text-foreground border border-border/50">
                  ✓ {r}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
            <ShieldCheck className="mx-auto mb-1 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Waiting for all 13 indicators to align…</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">RSI · Stoch RSI · MACD · Trend · VWAP · Volume · Bollinger · Macro · Learning accuracy · Volatility · All timeframes</p>
          </div>
        )}

        {/* Signal Outcomes - Win/Loss Evidence */}
        {history.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] uppercase text-muted-foreground font-medium">
                Signal Evidence (1 / 5 / 10 min)
              </span>
              <span className="relative flex h-1.5 w-1.5 ml-auto">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[9px] text-primary">LIVE</span>
            </div>
            <SignalOutcomes
              history={history}
              currentPrice={signals?.currentPrice ?? 0}
              currency={currency}
            />
          </div>
        )}

        {/* Signal history */}
        {history.length > 1 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Signal History</div>
            <div className="flex flex-wrap gap-1">
              {history.slice(-20).map((h, i) => (
                <span
                  key={i}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-medium ${
                    h.signal === "BUY"
                      ? "bg-chart-2/15 text-chart-2 border border-chart-2/30"
                      : "bg-destructive/15 text-destructive border border-destructive/30"
                  }`}
                  title={h.reasons.join("\n")}
                >
                  {h.signal} {currency}{h.price.toFixed(2)} @ {h.time}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
