import { useState, useEffect, useMemo } from "react";
import type { IntradayData } from "@/lib/api/optionsData";
import type { AnalysisResult } from "@/lib/stockData";
import { computeLiveSignals, type LiveSignals, type Signal, type AnalysisInput } from "@/lib/signalEngine";
import { getAccuracyStats, type AccuracySnapshot } from "@/lib/signalLearner";
import { PredictionDrilldown } from "@/components/options/PredictionDrilldown";
import { HighConvictionSignals } from "@/components/options/HighConvictionSignals";
import { ArrowUp, ArrowDown, Minus, Zap, Activity, TrendingUp, TrendingDown, BarChart3, Globe, AlertTriangle, Newspaper, Shield, Brain, Target, Gauge, Layers, LineChart } from "lucide-react";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

interface Props {
  data: IntradayData | null;
  symbol: string;
  analysis?: AnalysisResult | null;
  isIndian?: boolean;
}

const signalColor: Record<Signal, string> = {
  "STRONG BUY": "text-chart-2",
  BUY: "text-chart-2",
  HOLD: "text-chart-4",
  SELL: "text-destructive",
  "STRONG SELL": "text-destructive",
};

const signalBg: Record<Signal, string> = {
  "STRONG BUY": "bg-chart-2/20 border-chart-2/40",
  BUY: "bg-chart-2/10 border-chart-2/30",
  HOLD: "bg-chart-4/10 border-chart-4/30",
  SELL: "bg-destructive/10 border-destructive/30",
  "STRONG SELL": "bg-destructive/20 border-destructive/40",
};

const signalIcon: Record<Signal, React.ReactNode> = {
  "STRONG BUY": <ArrowUp className="h-5 w-5 text-chart-2" />,
  BUY: <ArrowUp className="h-4 w-4 text-chart-2" />,
  HOLD: <Minus className="h-4 w-4 text-chart-4" />,
  SELL: <ArrowDown className="h-4 w-4 text-destructive" />,
  "STRONG SELL": <ArrowDown className="h-5 w-5 text-destructive" />,
};

const impactIcon = {
  bullish: <TrendingUp className="h-3.5 w-3.5 text-chart-2" />,
  bearish: <TrendingDown className="h-3.5 w-3.5 text-destructive" />,
  neutral: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
};

const impactColor = {
  bullish: "text-chart-2",
  bearish: "text-destructive",
  neutral: "text-muted-foreground",
};

const impactBg = {
  bullish: "border-chart-2/20 bg-chart-2/5",
  bearish: "border-destructive/20 bg-destructive/5",
  neutral: "border-border bg-muted/30",
};

const factorIcons: Record<string, React.ReactNode> = {
  "Financial Highlights": <BarChart3 className="h-3.5 w-3.5" />,
  "News Digest": <Newspaper className="h-3.5 w-3.5" />,
  "Key Strengths": <TrendingUp className="h-3.5 w-3.5" />,
  "Key Risks": <AlertTriangle className="h-3.5 w-3.5" />,
  "Geopolitical Risk": <Globe className="h-3.5 w-3.5" />,
  "Controversy Scanner": <Shield className="h-3.5 w-3.5" />,
  "Macro Economics": <BarChart3 className="h-3.5 w-3.5" />,
  "Sector Winds": <TrendingUp className="h-3.5 w-3.5" />,
  "Regional Sentiment": <Globe className="h-3.5 w-3.5" />,
  "Media Manipulation": <Shield className="h-3.5 w-3.5" />,
};

const tfLabelMap: Record<number, string> = {
  30: "30s", 60: "1m", 180: "3m", 300: "5m", 600: "10m", 1800: "30m", 3600: "1h",
};

export function LivePredictions({ data, symbol, analysis, isIndian = false }: Props) {
  const curr = isIndian ? "₹" : "$";
  const [tick, setTick] = useState(0);
  const [drilldownTF, setDrilldownTF] = useState<number | null>(null);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const analysisInput: AnalysisInput | null = useMemo(() => {
    if (!analysis) return null;
    return {
      overallScore: analysis.overallScore,
      sentiment: analysis.sentiment,
      summary: analysis.summary,
      financialHighlights: analysis.financialHighlights,
      newsDigest: analysis.newsDigest,
      recommendation: analysis.prediction?.recommendation,
      confidenceScore: analysis.prediction?.confidenceScore,
      predictionReasoning: analysis.prediction?.predictionReasoning,
      macro: analysis.macro,
      strengths: analysis.strengths,
      risks: analysis.risks,
    };
  }, [analysis]);

  const signals = useMemo(() => {
    if (!data?.candles) return null;
    return computeLiveSignals(data.candles, analysisInput, symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, analysisInput, tick, symbol]);

  const accuracyStats = useMemo(() => getAccuracyStats(symbol), [symbol, tick]);

  if (!signals) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p>Waiting for market data for {symbol}…</p>
        <p className="mt-1 text-xs">Data refreshes every second during market hours.</p>
      </div>
    );
  }

  const overallSignal = signals.predictions[2]?.signal || "HOLD";

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
          {analysisInput && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Micro/Macro Active
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">Refreshing every 1s</span>
      </div>

      {/* Big price + overall signal */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{symbol}</div>
          <div className="text-4xl font-bold font-mono text-foreground">{curr}{signals.currentPrice.toFixed(2)}</div>
          {analysisInput && (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={analysisInput.sentiment === "bullish" ? "text-chart-2" : analysisInput.sentiment === "bearish" ? "text-destructive" : ""}>
                {analysisInput.sentiment}
              </span>
              <span>·</span>
              <span>AI Score {analysisInput.overallScore}/100</span>
              {analysisInput.recommendation && (
                <>
                  <span>·</span>
                  <span className={analysisInput.recommendation === "buy" ? "text-chart-2 font-medium uppercase" : analysisInput.recommendation === "sell" ? "text-destructive font-medium uppercase" : "font-medium uppercase"}>
                    {analysisInput.recommendation}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className={`flex flex-col items-center gap-1 rounded-xl border p-4 ${signalBg[overallSignal]}`}>
          {signalIcon[overallSignal]}
          <span className={`text-2xl font-bold ${signalColor[overallSignal]}`}>{overallSignal}</span>
          <span className="text-[10px] text-muted-foreground">Primary Signal (3 min)</span>
        </div>
      </div>

      {/* Technical indicators row - core */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">RSI (14)</div>
          <div className={`text-lg font-bold font-mono ${signals.rsi > 70 ? "text-destructive" : signals.rsi < 30 ? "text-chart-2" : "text-foreground"}`}>
            {signals.rsi.toFixed(1)}
          </div>
          <div className="text-[10px] text-muted-foreground">{signals.rsi > 70 ? "Overbought" : signals.rsi < 30 ? "Oversold" : "Neutral"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">VWAP</div>
          <div className="text-lg font-bold font-mono text-foreground">{curr}{signals.vwap.toFixed(2)}</div>
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

      {/* Enhanced indicators row (IB Academy factors) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Stoch RSI</div>
          <div className={`text-lg font-bold font-mono ${signals.stochRsi > 80 ? "text-destructive" : signals.stochRsi < 20 ? "text-chart-2" : "text-foreground"}`}>
            {signals.stochRsi.toFixed(0)}
          </div>
          <div className="text-[10px] text-muted-foreground">{signals.stochRsi > 80 ? "Overbought" : signals.stochRsi < 20 ? "Oversold" : "Neutral"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Bollinger %</div>
          <div className={`text-lg font-bold font-mono ${signals.bollingerPosition > 80 ? "text-destructive" : signals.bollingerPosition < 20 ? "text-chart-2" : "text-foreground"}`}>
            {signals.bollingerPosition.toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">{signals.bollingerPosition > 80 ? "Upper Band" : signals.bollingerPosition < 20 ? "Lower Band" : "Mid Range"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">MACD</div>
          <div className="flex items-center justify-center gap-1">
            {signals.macdSignal === "bullish" ? <TrendingUp className="h-4 w-4 text-chart-2" /> : signals.macdSignal === "bearish" ? <TrendingDown className="h-4 w-4 text-destructive" /> : <Minus className="h-4 w-4 text-muted-foreground" />}
            <span className={`text-lg font-bold capitalize ${signals.macdSignal === "bullish" ? "text-chart-2" : signals.macdSignal === "bearish" ? "text-destructive" : "text-foreground"}`}>{signals.macdSignal}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">ATR</div>
          <div className="text-lg font-bold font-mono text-foreground">{curr}{signals.atr.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">Avg Range</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Vol Regime</div>
          <div className={`text-lg font-bold capitalize ${signals.volatilityRegime === "high" ? "text-destructive" : signals.volatilityRegime === "low" ? "text-chart-4" : "text-foreground"}`}>
            {signals.volatilityRegime}
          </div>
          {signals.volumePriceDivergence && <div className="text-[10px] text-destructive font-medium">⚠ Divergence</div>}
        </div>
      </div>

      {/* Support / Resistance */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-chart-2/20 bg-chart-2/5 p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Support</div>
          <div className="text-lg font-bold font-mono text-chart-2">{curr}{signals.supportLevel.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Resistance</div>
          <div className="text-lg font-bold font-mono text-destructive">{curr}{signals.resistanceLevel.toFixed(2)}</div>
        </div>
      </div>

      {/* 100% Conviction Signals */}
      <HighConvictionSignals signals={signals} symbol={symbol} currency={curr} accuracyStats={accuracyStats} />

      {/* Recursive Learning Stats with per-timeframe accuracy */}
      {accuracyStats.total > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-primary" />
            Recursive Learning Engine
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">{accuracyStats.total} predictions tracked</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Overall Accuracy</div>
              <div className={`text-2xl font-bold font-mono ${accuracyStats.overall >= 55 ? "text-chart-2" : accuracyStats.overall <= 40 ? "text-destructive" : "text-foreground"}`}>
                {accuracyStats.overall.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground">{accuracyStats.correct}/{accuracyStats.total} correct</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Learned Weights</div>
              <div className="mt-1 flex flex-wrap justify-center gap-1 text-[9px]">
                <span className="rounded bg-primary/10 px-1 py-0.5">RSI {(accuracyStats.weights.rsi * 100).toFixed(0)}%</span>
                <span className="rounded bg-primary/10 px-1 py-0.5">EMA {(accuracyStats.weights.ema * 100).toFixed(0)}%</span>
                <span className="rounded bg-primary/10 px-1 py-0.5">Mom {(accuracyStats.weights.momentum * 100).toFixed(0)}%</span>
                <span className="rounded bg-primary/10 px-1 py-0.5">VWAP {(accuracyStats.weights.vwap * 100).toFixed(0)}%</span>
                <span className="rounded bg-primary/10 px-1 py-0.5">Vol {(accuracyStats.weights.volume * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
          {/* Per-timeframe accuracy grid */}
          {Object.keys(accuracyStats.byTimeframe).length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                <Layers className="h-3 w-3" /> Accuracy by Timeframe
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-7">
                {Object.entries(accuracyStats.byTimeframe)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([tf, d]) => {
                    const label = tfLabelMap[Number(tf)] || `${tf}s`;
                    const color = d.accuracy >= 60 ? "text-chart-2 border-chart-2/30 bg-chart-2/10" 
                      : d.accuracy >= 45 ? "text-chart-4 border-chart-4/30 bg-chart-4/10" 
                      : "text-destructive border-destructive/30 bg-destructive/10";
                    return (
                      <button
                        key={tf}
                        onClick={() => setDrilldownTF(Number(tf))}
                        className={`rounded-lg border p-2 text-center transition-all hover:ring-2 hover:ring-primary/40 cursor-pointer ${color}`}
                      >
                        <div className="text-[10px] font-medium uppercase">{label}</div>
                        <div className="text-sm font-bold font-mono">{d.accuracy.toFixed(0)}%</div>
                        <div className="text-[8px] opacity-70">{d.total} pred · click</div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Accuracy Improvement Chart */}
          {accuracyStats.history.length >= 2 && (
            <div className="mt-3">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                <LineChart className="h-3 w-3" /> Prediction Accuracy Over Time
              </div>
              <div className="h-48 w-full rounded-lg border border-border bg-muted/20 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={accuracyStats.history.map((h, i) => ({
                      idx: i + 1,
                      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      overall: Number(h.overall.toFixed(1)),
                      predictions: h.totalPredictions,
                      ...Object.fromEntries(
                        Object.entries(h.byTimeframe).map(([tf, acc]) => [
                          tfLabelMap[Number(tf)] || `${tf}s`,
                          Number(acc.toFixed(1)),
                        ])
                      ),
                    }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} className="fill-muted-foreground" unit="%" width={35} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Line type="monotone" dataKey="overall" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Overall" />
                    {Object.values(tfLabelMap).slice(0, 4).map((label, i) => {
                      const colors = ['hsl(var(--chart-2))', 'hsl(var(--chart-4))', 'hsl(var(--chart-1))', 'hsl(var(--chart-3))'];
                      return (
                        <Line key={label} type="monotone" dataKey={label} stroke={colors[i]} strokeWidth={1} dot={false} name={label} strokeOpacity={0.6} />
                      );
                    })}
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeframe predictions grid */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-primary" />
          Predictions by Timeframe
          {analysisInput && <span className="text-[10px] font-normal text-muted-foreground">(IB Academy Enhanced · 12 indicators · Recursive learning)</span>}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {signals.predictions.map((p) => {
            const tfAccuracy = accuracyStats.byTimeframe[p.seconds];
            return (
              <div key={p.label} className={`rounded-xl border p-4 transition-all ${signalBg[p.signal]}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{p.label}</span>
                  <div className="flex items-center gap-1">
                    {tfAccuracy && (
                      <span className={`text-[9px] font-mono rounded px-1 py-0.5 ${tfAccuracy.accuracy >= 55 ? "bg-chart-2/20 text-chart-2" : tfAccuracy.accuracy <= 40 ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {tfAccuracy.accuracy.toFixed(0)}% acc
                      </span>
                    )}
                    {signalIcon[p.signal]}
                  </div>
                </div>
                <div className={`text-xl font-bold ${signalColor[p.signal]}`}>{p.signal}</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-foreground">{curr}{p.predictedPrice.toFixed(2)}</span>
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
                      className={`h-full rounded-full transition-all ${p.confidence >= 70 ? "bg-chart-2" : p.confidence >= 40 ? "bg-chart-4" : "bg-destructive"}`}
                      style={{ width: `${p.confidence}%` }}
                    />
                  </div>
                </div>
                {/* Reasoning */}
                {p.reasoning && <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{p.reasoning}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Macro/Micro Detail Cards */}
      {signals.macroMicro && signals.macroMicro.details.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Brain className="h-4 w-4 text-primary" />
            Micro & Macro Factors Influencing Signals
            <span className="relative flex h-2 w-2 ml-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
            </span>
            <span className="text-[10px] font-normal text-chart-2">LIVE</span>
            {signals.macroMicro.priceConfirmation && signals.macroMicro.priceConfirmation !== "neutral" && (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                signals.macroMicro.priceConfirmation === "confirming" 
                  ? "bg-chart-2/15 text-chart-2 border border-chart-2/30" 
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}>
                Price {signals.macroMicro.priceConfirmation === "confirming" ? "✓ confirms" : "✗ contradicts"} macro
                {signals.macroMicro.confirmationStrength && ` (${signals.macroMicro.confirmationStrength.toFixed(2)}x)`}
              </span>
            )}
          </h3>

          {/* Score bars */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sentiment Score</span>
                <span className={`font-bold ${signals.macroMicro.sentimentScore >= 60 ? "text-chart-2" : signals.macroMicro.sentimentScore <= 40 ? "text-destructive" : "text-foreground"}`}>
                  {signals.macroMicro.sentimentScore.toFixed(0)}/100
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${signals.macroMicro.sentimentScore >= 60 ? "bg-chart-2" : signals.macroMicro.sentimentScore <= 40 ? "bg-destructive" : "bg-chart-4"}`} style={{ width: `${signals.macroMicro.sentimentScore}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Macro Environment</span>
                <span className={`font-bold ${signals.macroMicro.macroScore >= 60 ? "text-chart-2" : signals.macroMicro.macroScore <= 40 ? "text-destructive" : "text-foreground"}`}>
                  {signals.macroMicro.macroScore.toFixed(0)}/100
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${signals.macroMicro.macroScore >= 60 ? "bg-chart-2" : signals.macroMicro.macroScore <= 40 ? "bg-destructive" : "bg-chart-4"}`} style={{ width: `${signals.macroMicro.macroScore}%` }} />
              </div>
            </div>
          </div>

          {/* Factor cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            {signals.macroMicro.details.map((d, i) => (
              <div key={i} className={`rounded-lg border p-3 ${impactBg[d.impact]}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={impactColor[d.impact]}>{factorIcons[d.label] || <Brain className="h-3.5 w-3.5" />}</span>
                  <span className="text-xs font-semibold text-foreground">{d.label}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {impactIcon[d.impact]}
                    <span className={`text-[10px] font-medium capitalize ${impactColor[d.impact]}`}>{d.impact}</span>
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">{d.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!signals.macroMicro && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          <Brain className="mx-auto mb-1 h-5 w-5 text-muted-foreground/40" />
          No micro/macro analysis available for {symbol}. Run analysis from the Market Dashboard to enhance predictions with fundamental + geopolitical data.
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        Enhanced with IB Traders' Academy factors: Bollinger Bands, MACD, Stochastic RSI, ATR, Support/Resistance, Volume-Price Divergence, Volatility Regime.
        Recursive learning tracks & auto-adjusts. Not financial advice.
      </p>

      <PredictionDrilldown
        symbol={symbol}
        timeframeSeconds={drilldownTF ?? 60}
        open={drilldownTF !== null}
        onOpenChange={(open) => { if (!open) setDrilldownTF(null); }}
        currency={curr}
      />
    </div>
  );
}
