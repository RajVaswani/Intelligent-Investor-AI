import { useState, useEffect, useMemo } from "react";
import type { IntradayData } from "@/lib/api/optionsData";
import { computeLiveSignals, type LiveSignals, type Signal } from "@/lib/signalEngine";
import { ArrowUp, ArrowDown, Minus, Zap, Activity, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface Props {
  data: IntradayData | null;
  symbol: string;
}

const signalColor: Record<Signal, string> = {
  "STRONG BUY": "text-chart-2",
  "BUY": "text-chart-2",
  "HOLD": "text-chart-4",
  "SELL": "text-destructive",
  "STRONG SELL": "text-destructive",
};

const signalBg: Record<Signal, string> = {
  "STRONG BUY": "bg-chart-2/20 border-chart-2/40",
  "BUY": "bg-chart-2/10 border-chart-2/30",
  "HOLD": "bg-chart-4/10 border-chart-4/30",
  "SELL": "bg-destructive/10 border-destructive/30",
  "STRONG SELL": "bg-destructive/20 border-destructive/40",
};

const signalIcon: Record<Signal, React.ReactNode> = {
  "STRONG BUY": <ArrowUp className="h-5 w-5 text-chart-2" />,
  "BUY": <ArrowUp className="h-4 w-4 text-chart-2" />,
  "HOLD": <Minus className="h-4 w-4 text-chart-4" />,
  "SELL": <ArrowDown className="h-4 w-4 text-destructive" />,
  "STRONG SELL": <ArrowDown className="h-5 w-5 text-destructive" />,
};

export function LivePredictions({ data, symbol }: Props) {
  const [tick, setTick] = useState(0);

  // Force re-render every second to show fresh timestamp
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const signals = useMemo(() => {
    if (!data?.candles) return null;
    return computeLiveSignals(data.candles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick]);

  if (!signals) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p>Waiting for market data for {symbol}…</p>
        <p className="mt-1 text-xs">Data refreshes every second during market hours.</p>
      </div>
    );
  }

  const overallSignal = signals.predictions[2]?.signal || "HOLD"; // 3-min as primary

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-chart-2" />
          </span>
          <span className="text-xs font-medium text-chart-2">LIVE</span>
          <span className="text-xs text-muted-foreground">
            Updated {new Date(signals.updatedAt).toLocaleTimeString()}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Refreshing every 1s
        </span>
      </div>

      {/* Big price + overall signal */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{symbol}</div>
          <div className="text-4xl font-bold font-mono text-foreground">${signals.currentPrice.toFixed(2)}</div>
        </div>
        <div className={`flex flex-col items-center gap-1 rounded-xl border p-4 ${signalBg[overallSignal]}`}>
          {signalIcon[overallSignal]}
          <span className={`text-2xl font-bold ${signalColor[overallSignal]}`}>{overallSignal}</span>
          <span className="text-[10px] text-muted-foreground">Primary Signal (3 min)</span>
        </div>
      </div>

      {/* Technical indicators row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">RSI (14)</div>
          <div className={`text-lg font-bold font-mono ${
            signals.rsi > 70 ? "text-destructive" : signals.rsi < 30 ? "text-chart-2" : "text-foreground"
          }`}>{signals.rsi.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground">
            {signals.rsi > 70 ? "Overbought" : signals.rsi < 30 ? "Oversold" : "Neutral"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">VWAP</div>
          <div className="text-lg font-bold font-mono text-foreground">${signals.vwap.toFixed(2)}</div>
          <div className={`text-[10px] ${signals.priceVsVwap === "above" ? "text-chart-2" : signals.priceVsVwap === "below" ? "text-destructive" : "text-muted-foreground"}`}>
            Price {signals.priceVsVwap}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Momentum</div>
          <div className={`text-lg font-bold font-mono ${signals.momentum >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {signals.momentum >= 0 ? "+" : ""}{signals.momentum.toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Trend</div>
          <div className="flex items-center justify-center gap-1">
            {signals.trend === "up" ? <TrendingUp className="h-4 w-4 text-chart-2" /> : signals.trend === "down" ? <TrendingDown className="h-4 w-4 text-destructive" /> : <Minus className="h-4 w-4 text-muted-foreground" />}
            <span className={`text-lg font-bold capitalize ${signals.trend === "up" ? "text-chart-2" : signals.trend === "down" ? "text-destructive" : "text-foreground"}`}>{signals.trend}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Volume</div>
          <div className="flex items-center justify-center gap-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold capitalize text-foreground">{signals.volumeTrend}</span>
          </div>
        </div>
      </div>

      {/* Timeframe predictions grid */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-primary" />
          Predictions by Timeframe
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {signals.predictions.map((p) => (
            <div key={p.label} className={`rounded-xl border p-4 transition-all ${signalBg[p.signal]}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{p.label}</span>
                {signalIcon[p.signal]}
              </div>
              <div className={`text-xl font-bold ${signalColor[p.signal]}`}>{p.signal}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-mono text-foreground">${p.predictedPrice.toFixed(2)}</span>
                <span className={p.predictedChange >= 0 ? "text-chart-2" : "text-destructive"}>
                  {p.predictedChange >= 0 ? "+" : ""}{p.predictedChange.toFixed(3)}%
                </span>
              </div>
              {/* Confidence bar */}
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Confidence</span>
                  <span>{p.confidence}%</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.confidence >= 70 ? "bg-chart-2" : p.confidence >= 40 ? "bg-chart-4" : "bg-destructive"
                    }`}
                    style={{ width: `${p.confidence}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-muted-foreground">
        Signals are computed from technical indicators (RSI, EMA 9/21, VWAP, momentum, volume). 
        Not financial advice. Past performance does not indicate future results.
      </p>
    </div>
  );
}
