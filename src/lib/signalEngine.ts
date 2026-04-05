import type { IntradayCandle } from "@/lib/api/optionsData";

export type Signal = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export interface TimeframePrediction {
  label: string;
  seconds: number;
  signal: Signal;
  confidence: number;
  predictedPrice: number;
  predictedChange: number;
  reasoning: string;
}

export interface MacroMicroInfluence {
  sentimentScore: number; // 0-100
  macroScore: number; // 0-100
  details: {
    label: string;
    impact: "bullish" | "bearish" | "neutral";
    summary: string;
  }[];
}

export interface LiveSignals {
  currentPrice: number;
  vwap: number;
  rsi: number;
  momentum: number;
  trend: "up" | "down" | "flat";
  volumeTrend: "rising" | "falling" | "stable";
  priceVsVwap: "above" | "below" | "at";
  predictions: TimeframePrediction[];
  macroMicro: MacroMicroInfluence | null;
  updatedAt: number;
}

export interface AnalysisInput {
  overallScore: number;
  sentiment: string;
  summary: string;
  financialHighlights?: string;
  newsDigest?: string;
  recommendation?: string | null;
  confidenceScore?: number | null;
  predictionReasoning?: string;
  macro?: {
    geopoliticalAnalysis?: string;
    controversyScanner?: string;
    macroEconomicFactors?: string;
    sectorTailwindsHeadwinds?: string;
    regionalSentiment?: string;
    mediaManipulationCheck?: string;
  };
  strengths?: string[];
  risks?: string[];
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function computeEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function getSignal(score: number): Signal {
  if (score >= 70) return "STRONG BUY";
  if (score >= 55) return "BUY";
  if (score >= 45) return "HOLD";
  if (score >= 30) return "SELL";
  return "STRONG SELL";
}

function sentimentToScore(sentiment: string): number {
  if (sentiment === "bullish") return 70;
  if (sentiment === "bearish") return 30;
  return 50;
}

function recommendationToScore(rec: string | null | undefined): number {
  if (!rec) return 50;
  if (rec === "buy") return 70;
  if (rec === "sell") return 30;
  return 50;
}

function textToImpact(text: string | undefined): "bullish" | "bearish" | "neutral" {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const bullish = (lower.match(/growth|strong|positive|tailwind|uptick|surge|boom|rally|upgrade|outperform/g) || []).length;
  const bearish = (lower.match(/risk|weak|negative|headwind|decline|crash|downturn|scandal|controversy|fraud|downgrade|recession/g) || []).length;
  if (bullish > bearish + 1) return "bullish";
  if (bearish > bullish + 1) return "bearish";
  return "neutral";
}

function impactToScore(impact: "bullish" | "bearish" | "neutral"): number {
  if (impact === "bullish") return 65;
  if (impact === "bearish") return 35;
  return 50;
}

function buildMacroMicro(analysis: AnalysisInput): MacroMicroInfluence {
  const details: MacroMicroInfluence["details"] = [];

  // Micro factors
  if (analysis.financialHighlights) {
    const impact = textToImpact(analysis.financialHighlights);
    details.push({ label: "Financial Highlights", impact, summary: analysis.financialHighlights.slice(0, 200) });
  }
  if (analysis.newsDigest) {
    const impact = textToImpact(analysis.newsDigest);
    details.push({ label: "News Digest", impact, summary: analysis.newsDigest.slice(0, 200) });
  }
  if (analysis.strengths && analysis.strengths.length > 0) {
    details.push({ label: "Key Strengths", impact: "bullish", summary: analysis.strengths.slice(0, 3).join("; ") });
  }
  if (analysis.risks && analysis.risks.length > 0) {
    details.push({ label: "Key Risks", impact: "bearish", summary: analysis.risks.slice(0, 3).join("; ") });
  }

  // Macro factors
  if (analysis.macro?.geopoliticalAnalysis) {
    const impact = textToImpact(analysis.macro.geopoliticalAnalysis);
    details.push({ label: "Geopolitical Risk", impact, summary: analysis.macro.geopoliticalAnalysis.slice(0, 200) });
  }
  if (analysis.macro?.controversyScanner) {
    const impact = textToImpact(analysis.macro.controversyScanner);
    details.push({ label: "Controversy Scanner", impact, summary: analysis.macro.controversyScanner.slice(0, 200) });
  }
  if (analysis.macro?.macroEconomicFactors) {
    const impact = textToImpact(analysis.macro.macroEconomicFactors);
    details.push({ label: "Macro Economics", impact, summary: analysis.macro.macroEconomicFactors.slice(0, 200) });
  }
  if (analysis.macro?.sectorTailwindsHeadwinds) {
    const impact = textToImpact(analysis.macro.sectorTailwindsHeadwinds);
    details.push({ label: "Sector Winds", impact, summary: analysis.macro.sectorTailwindsHeadwinds.slice(0, 200) });
  }
  if (analysis.macro?.regionalSentiment) {
    const impact = textToImpact(analysis.macro.regionalSentiment);
    details.push({ label: "Regional Sentiment", impact, summary: analysis.macro.regionalSentiment.slice(0, 200) });
  }
  if (analysis.macro?.mediaManipulationCheck) {
    const impact = textToImpact(analysis.macro.mediaManipulationCheck);
    details.push({ label: "Media Manipulation", impact, summary: analysis.macro.mediaManipulationCheck.slice(0, 200) });
  }

  // Compute aggregate scores
  const sentimentScore = sentimentToScore(analysis.sentiment);
  const macroScores = details.filter(d => ["Geopolitical Risk", "Macro Economics", "Sector Winds", "Regional Sentiment"].includes(d.label));
  const macroAvg = macroScores.length > 0
    ? macroScores.reduce((sum, d) => sum + impactToScore(d.impact), 0) / macroScores.length
    : 50;

  return { sentimentScore, macroScore: macroAvg, details };
}

export function computeLiveSignals(candles: IntradayCandle[], analysis?: AnalysisInput | null): LiveSignals | null {
  if (!candles || candles.length < 20) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const currentPrice = closes[closes.length - 1];
  const lastVwap = candles[candles.length - 1].vwap;

  const rsi = computeRSI(closes);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const currentEma9 = ema9[ema9.length - 1];
  const currentEma21 = ema21[ema21.length - 1];

  const lookback = Math.min(5, closes.length - 1);
  const momentum = ((currentPrice - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100;

  const recentVol = volumes.slice(-10);
  const olderVol = volumes.slice(-20, -10);
  const avgRecent = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
  const avgOlder = olderVol.length > 0 ? olderVol.reduce((a, b) => a + b, 0) / olderVol.length : avgRecent;
  const volumeTrend: "rising" | "falling" | "stable" = avgRecent > avgOlder * 1.15 ? "rising" : avgRecent < avgOlder * 0.85 ? "falling" : "stable";

  const trend: "up" | "down" | "flat" = currentEma9 > currentEma21 * 1.001 ? "up" : currentEma9 < currentEma21 * 0.999 ? "down" : "flat";
  const vwapDiff = (currentPrice - lastVwap) / lastVwap;
  const priceVsVwap: "above" | "below" | "at" = vwapDiff > 0.001 ? "above" : vwapDiff < -0.001 ? "below" : "at";

  // Technical scores
  const rsiScore = rsi > 70 ? 30 : rsi < 30 ? 70 : 50 + (50 - rsi) * 0.4;
  const emaScore = currentEma9 > currentEma21 ? 65 : currentEma9 < currentEma21 ? 35 : 50;
  const vwapScore = priceVsVwap === "above" ? 60 : priceVsVwap === "below" ? 40 : 50;
  const momScore = momentum > 0.1 ? 65 : momentum < -0.1 ? 35 : 50;
  const volScore = volumeTrend === "rising" && trend === "up" ? 65 : volumeTrend === "rising" && trend === "down" ? 35 : 50;

  // Technical base: 60% weight
  const technicalScore = rsiScore * 0.25 + emaScore * 0.25 + vwapScore * 0.2 + momScore * 0.2 + volScore * 0.1;

  // Macro/Micro influence: 40% weight when available
  let macroMicro: MacroMicroInfluence | null = null;
  let fundamentalScore = 50;

  if (analysis) {
    macroMicro = buildMacroMicro(analysis);

    const aiScore = analysis.overallScore; // 0-100
    const sentScore = macroMicro.sentimentScore;
    const macScore = macroMicro.macroScore;
    const recScore = recommendationToScore(analysis.recommendation);
    const confScore = analysis.confidenceScore ? analysis.confidenceScore : 50;

    // Weighted fundamental score
    fundamentalScore = aiScore * 0.3 + sentScore * 0.2 + macScore * 0.2 + recScore * 0.15 + confScore * 0.15;
  }

  // Final composite: shorter timeframes = more technical, longer = more fundamental
  const timeframes = [
    { label: "30 sec", seconds: 30, techWeight: 0.95 },
    { label: "1 min", seconds: 60, techWeight: 0.90 },
    { label: "3 min", seconds: 180, techWeight: 0.80 },
    { label: "5 min", seconds: 300, techWeight: 0.70 },
    { label: "10 min", seconds: 600, techWeight: 0.55 },
    { label: "30 min", seconds: 1800, techWeight: 0.40 },
    { label: "1 hour", seconds: 3600, techWeight: 0.30 },
  ];

  const recentCloses = closes.slice(-30);
  const velocity = recentCloses.length > 1
    ? (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses.length
    : 0;
  const candleIntervalSec = candles.length > 1 ? (candles[candles.length - 1].time - candles[candles.length - 2].time) / 1000 : 60;
  const velocityPerSec = velocity / candleIntervalSec;

  const returns: number[] = [];
  for (let i = 1; i < recentCloses.length; i++) {
    returns.push((recentCloses[i] - recentCloses[i - 1]) / recentCloses[i - 1]);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  const predictions: TimeframePrediction[] = timeframes.map(tf => {
    const tw = analysis ? tf.techWeight : 1; // if no analysis, 100% technical
    const compositeScore = technicalScore * tw + fundamentalScore * (1 - tw);

    const tfFactor = Math.min(tf.seconds / 60, 10);
    const reversion = (50 - compositeScore) * 0.02 * tfFactor;
    const adjustedScore = Math.max(0, Math.min(100, compositeScore + reversion));

    const projectedMove = velocityPerSec * tf.seconds;
    // Adjust projection by fundamental bias for longer timeframes
    const fundBias = (fundamentalScore - 50) / 50 * 0.001 * tf.seconds * (1 - tw);
    const predictedPrice = currentPrice + projectedMove + currentPrice * fundBias;
    const predictedChange = ((predictedPrice - currentPrice) / currentPrice) * 100;

    const baseConfidence = 85;
    const timeDecay = Math.max(0.3, 1 - (tf.seconds / 7200));
    const volPenalty = Math.max(0.4, 1 - volatility * 50);
    const analysisBonusConf = analysis ? 1.1 : 1;
    const confidence = Math.min(95, Math.round(baseConfidence * timeDecay * volPenalty * analysisBonusConf));

    // Build reasoning
    const parts: string[] = [];
    if (tw >= 0.5) {
      parts.push(`Technical (${(tw * 100).toFixed(0)}%): RSI ${rsi.toFixed(1)}, EMA ${trend}, VWAP ${priceVsVwap}, Mom ${momentum >= 0 ? "+" : ""}${momentum.toFixed(3)}%`);
    }
    if (analysis && tw < 1) {
      parts.push(`Fundamental (${((1 - tw) * 100).toFixed(0)}%): ${analysis.sentiment} sentiment, score ${analysis.overallScore}/100${analysis.recommendation ? `, ${analysis.recommendation}` : ""}`);
    }

    return {
      label: tf.label,
      seconds: tf.seconds,
      signal: getSignal(adjustedScore),
      confidence,
      predictedPrice,
      predictedChange,
      reasoning: parts.join(" | "),
    };
  });

  return {
    currentPrice,
    vwap: lastVwap,
    rsi,
    momentum,
    trend,
    volumeTrend,
    priceVsVwap,
    predictions,
    macroMicro,
    updatedAt: Date.now(),
  };
}
