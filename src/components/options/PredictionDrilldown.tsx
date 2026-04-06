import { useState, useMemo } from "react";
import { getPredictionsByTimeframe, type PredictionRecord } from "@/lib/signalLearner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, Activity, BarChart3, Brain, Shield, Globe, Newspaper, AlertTriangle, Gauge, Target, Layers } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const tfLabelMap: Record<number, string> = {
  30: "30s", 60: "1m", 180: "3m", 300: "5m", 600: "10m", 1800: "30m", 3600: "1h",
};

interface Props {
  symbol: string;
  timeframeSeconds: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

export function PredictionDrilldown({ symbol, timeframeSeconds, open, onOpenChange, currency }: Props) {
  const predictions = useMemo(() => {
    if (!open) return [];
    return getPredictionsByTimeframe(symbol, timeframeSeconds).reverse();
  }, [symbol, timeframeSeconds, open]);

  const correct = predictions.filter(p => p.wasCorrect).length;
  const total = predictions.length;
  const label = tfLabelMap[timeframeSeconds] || `${timeframeSeconds}s`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {label} Predictions — {symbol}
          </DialogTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-chart-2" /> {correct} correct
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-destructive" /> {total - correct} wrong
            </span>
            <span className="font-mono">{total > 0 ? ((correct / total) * 100).toFixed(1) : 0}% accuracy</span>
          </div>
        </DialogHeader>
        <ScrollArea className="h-[65vh] px-6 pb-6">
          {predictions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              No verified predictions yet for this timeframe.
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-1">
              {predictions.map((pred, i) => (
                <PredictionRow key={`${pred.timestamp}-${i}`} pred={pred} currency={currency} index={i} />
              ))}
            </Accordion>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function PredictionRow({ pred, currency, index }: { pred: PredictionRecord; currency: string; index: number }) {
  const isCorrect = pred.wasCorrect;
  const borderClass = isCorrect ? "border-chart-2/30 bg-chart-2/5" : "border-destructive/30 bg-destructive/5";
  const time = new Date(pred.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dirIcon = pred.predictedDirection === "up" ? <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
    : pred.predictedDirection === "down" ? <TrendingDown className="h-3.5 w-3.5 text-destructive" />
    : <Minus className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <AccordionItem value={`pred-${index}`} className={`rounded-lg border ${borderClass} overflow-hidden`}>
      <AccordionTrigger className="px-3 py-2 hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5">
        <div className="flex w-full items-center gap-2 text-left">
          {isCorrect ? <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
          <span className="text-[11px] text-muted-foreground shrink-0">{time}</span>
          <span className="flex items-center gap-1 shrink-0">{dirIcon}<span className="text-xs font-medium capitalize">{pred.predictedDirection}</span></span>
          <span className="ml-auto text-xs font-mono text-foreground">
            {currency}{pred.actualPriceAtPrediction.toFixed(2)} → {currency}{pred.predictedPrice.toFixed(2)}
          </span>
          {pred.actualPrice !== undefined && (
            <span className={`text-[10px] font-mono ${isCorrect ? "text-chart-2" : "text-destructive"}`}>
              (actual: {currency}{pred.actualPrice.toFixed(2)})
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3 pt-0">
        {pred.context ? <ContextDetail ctx={pred.context} currency={currency} /> : (
          <p className="text-xs text-muted-foreground italic">No detailed context available (historical replay prediction).</p>
        )}
        {pred.error !== undefined && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Price error: <span className="font-mono">{pred.error.toFixed(3)}%</span>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function ContextDetail({ ctx, currency }: { ctx: NonNullable<PredictionRecord["context"]>; currency: string }) {
  return (
    <div className="space-y-3">
      {/* Technical Indicators */}
      <div>
        <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
          <BarChart3 className="h-3 w-3" /> Technical Indicators Used
        </h4>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          <Chip label="RSI" value={ctx.rsi.toFixed(1)} warn={ctx.rsi > 70 || ctx.rsi < 30} />
          <Chip label="Stoch RSI" value={ctx.stochRsi.toFixed(0)} warn={ctx.stochRsi > 80 || ctx.stochRsi < 20} />
          <Chip label="Bollinger %" value={`${ctx.bollingerPosition.toFixed(0)}%`} />
          <Chip label="MACD" value={ctx.macdHistogram.toFixed(3)} extra={ctx.macdCrossover !== "neutral" ? `[${ctx.macdCrossover}]` : undefined} />
          <Chip label="ATR" value={`${currency}${ctx.atr.toFixed(2)}`} />
          <Chip label="Momentum" value={`${ctx.momentum >= 0 ? "+" : ""}${ctx.momentum.toFixed(3)}%`} />
          <Chip label="VWAP" value={`${currency}${ctx.vwap.toFixed(2)}`} />
          <Chip label="Trend" value={ctx.trend} />
          <Chip label="Volume" value={ctx.volumeTrend} />
          <Chip label="Vol Regime" value={ctx.volatilityRegime} warn={ctx.volatilityRegime === "high"} />
          <Chip label="Support" value={`${currency}${ctx.support.toFixed(2)}`} />
          <Chip label="Resistance" value={`${currency}${ctx.resistance.toFixed(2)}`} />
        </div>
        {ctx.volumePriceDivergence && (
          <div className="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> Volume-Price Divergence detected
          </div>
        )}
      </div>

      {/* Composite Scores */}
      <div>
        <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
          <Gauge className="h-3 w-3" /> Scoring Breakdown
        </h4>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <ScoreBar label="Technical" score={ctx.technicalScore} />
          <ScoreBar label="Fundamental" score={ctx.fundamentalScore} />
          <ScoreBar label="Composite" score={ctx.compositeScore} />
          <div className="rounded border border-border bg-muted/30 px-2 py-1.5 text-center">
            <div className="text-[9px] text-muted-foreground">Tech Weight</div>
            <div className="text-xs font-bold font-mono text-foreground">{(ctx.techWeight * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* Learned Weights */}
      <div>
        <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
          <Layers className="h-3 w-3" /> Recursive Weights at Prediction Time
        </h4>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ctx.weights).map(([k, v]) => (
            <span key={k} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono text-primary">
              {k} {(v * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      {/* Macro/Micro */}
      {ctx.macroDetails && ctx.macroDetails.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
            <Brain className="h-3 w-3" /> Macro & Micro Factors
          </h4>
          <div className="space-y-1">
            {ctx.macroDetails.map((d, i) => {
              const colorMap: Record<string, string> = { bullish: "text-chart-2 border-chart-2/20 bg-chart-2/5", bearish: "text-destructive border-destructive/20 bg-destructive/5", neutral: "text-muted-foreground border-border bg-muted/30" };
              return (
                <div key={i} className={`rounded border px-2 py-1.5 ${colorMap[d.impact] || colorMap.neutral}`}>
                  <div className="flex items-center gap-1 text-[10px] font-semibold">
                    {d.impact === "bullish" ? <TrendingUp className="h-3 w-3" /> : d.impact === "bearish" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {d.label} <span className="ml-auto text-[9px] capitalize font-normal opacity-70">{d.impact}</span>
                  </div>
                  <p className="mt-0.5 text-[9px] leading-relaxed opacity-80">{d.summary}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
            {ctx.sentiment && <span>Sentiment: <span className={ctx.sentiment === "bullish" ? "text-chart-2" : ctx.sentiment === "bearish" ? "text-destructive" : ""}>{ctx.sentiment}</span></span>}
            {ctx.overallAIScore !== undefined && <span>AI Score: {ctx.overallAIScore}/100</span>}
            {ctx.recommendation && <span>Rec: <span className="uppercase font-medium">{ctx.recommendation}</span></span>}
          </div>
        </div>
      )}

      {/* Reasoning string */}
      {ctx.reasoning && (
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase text-muted-foreground mb-0.5">Signal Reasoning</div>
          <p className="text-[10px] leading-relaxed text-foreground font-mono">{ctx.reasoning}</p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, warn, extra }: { label: string; value: string; warn?: boolean; extra?: string }) {
  return (
    <div className={`rounded border px-2 py-1 text-center ${warn ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}>
      <div className="text-[8px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-[11px] font-bold font-mono ${warn ? "text-destructive" : "text-foreground"}`}>{value}</div>
      {extra && <div className="text-[8px] text-primary font-medium">{extra}</div>}
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 60 ? "bg-chart-2" : score <= 40 ? "bg-destructive" : "bg-chart-4";
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono font-bold text-foreground">{score.toFixed(0)}</span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}
