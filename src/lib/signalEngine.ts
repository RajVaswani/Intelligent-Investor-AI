/**
 * Enhanced Signal Engine v2
 * 
 * Incorporates lessons from IB Traders' Academy:
 * - Greeks-inspired sensitivity analysis (Delta-like momentum, Gamma acceleration, Theta time decay, Vega volatility)
 * - Bollinger Bands for mean reversion / breakout detection
 * - MACD for trend confirmation
 * - Stochastic RSI for overbought/oversold in trending markets
 * - ATR (Average True Range) for volatility-adjusted predictions
 * - Support/Resistance detection from recent price action
 * - Volume-price divergence (common mistake: ignoring volume confirmation)
 * - Volatility regime detection (high IV vs low IV environments)
 * - Put-Call parity inspired contrarian signals
 * - Common trader mistakes: fighting the trend, ignoring time decay, overtrading in low volatility
 */

import type { IntradayCandle } from "@/lib/api/optionsData";
import { getLearnedWeights, recordPrediction, verifyPredictions, type IndicatorAccuracy, type PredictionContext } from "@/lib/signalLearner";

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
  sentimentScore: number;
  macroScore: number;
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
  // New enhanced indicators
  bollingerPosition: number; // 0-100 (0=lower band, 100=upper band)
  macdSignal: "bullish" | "bearish" | "neutral";
  stochRsi: number;
  atr: number;
  volatilityRegime: "high" | "normal" | "low";
  supportLevel: number;
  resistanceLevel: number;
  volumePriceDivergence: boolean;
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

// ─── Technical Indicators ───────────────────────────────────────────

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
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

function computeSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Stochastic RSI - better overbought/oversold in trending markets (IB: common mistake is using RSI alone)
function computeStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14): number {
  if (closes.length < rsiPeriod + stochPeriod + 1) return 50;
  const rsiValues: number[] = [];
  for (let i = rsiPeriod + 1; i <= closes.length; i++) {
    rsiValues.push(computeRSI(closes.slice(0, i), rsiPeriod));
  }
  if (rsiValues.length < stochPeriod) return 50;
  const recent = rsiValues.slice(-stochPeriod);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  if (max === min) return 50;
  return ((rsiValues[rsiValues.length - 1] - min) / (max - min)) * 100;
}

// Bollinger Bands - key for mean reversion vs breakout (IB: volatility profile tool)
function computeBollingerBands(closes: number[], period = 20, stdDev = 2): { upper: number; middle: number; lower: number; position: number } {
  if (closes.length < period) return { upper: closes[closes.length - 1], middle: closes[closes.length - 1], lower: closes[closes.length - 1], position: 50 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, v) => a + (v - sma) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = sma + stdDev * sd;
  const lower = sma - stdDev * sd;
  const current = closes[closes.length - 1];
  const position = upper === lower ? 50 : ((current - lower) / (upper - lower)) * 100;
  return { upper, middle: sma, lower, position: Math.max(0, Math.min(100, position)) };
}

// MACD - trend confirmation (IB: essential for understanding momentum direction)
function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number; crossover: "bullish" | "bearish" | "neutral" } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0, crossover: "neutral" };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(-9), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macd - signal;
  const prevHistogram = macdLine.length > 1 ? macdLine[macdLine.length - 2] - (signalLine.length > 1 ? signalLine[signalLine.length - 2] : signal) : 0;
  const crossover = histogram > 0 && prevHistogram <= 0 ? "bullish" : histogram < 0 && prevHistogram >= 0 ? "bearish" : "neutral";
  return { macd, signal, histogram, crossover };
}

// ATR - Average True Range for volatility-adjusted predictions (IB: key for position sizing and stops)
function computeATR(candles: IntradayCandle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high || candles[i].close;
    const low = candles[i].low || candles[i].close;
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Support/Resistance detection (IB: critical for understanding price levels where traders made mistakes)
function findSupportResistance(closes: number[], lookback = 50): { support: number; resistance: number } {
  const recent = closes.slice(-lookback);
  if (recent.length < 10) return { support: recent[0], resistance: recent[recent.length - 1] };
  
  // Find pivot lows (support) and pivot highs (resistance)
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i] > recent[i - 1] && recent[i] > recent[i - 2] && recent[i] > recent[i + 1] && recent[i] > recent[i + 2]) {
      pivotHighs.push(recent[i]);
    }
    if (recent[i] < recent[i - 1] && recent[i] < recent[i - 2] && recent[i] < recent[i + 1] && recent[i] < recent[i + 2]) {
      pivotLows.push(recent[i]);
    }
  }
  const current = recent[recent.length - 1];
  const support = pivotLows.length > 0 ? Math.max(...pivotLows.filter(l => l < current), Math.min(...recent)) : Math.min(...recent);
  const resistance = pivotHighs.length > 0 ? Math.min(...pivotHighs.filter(h => h > current), Math.max(...recent)) : Math.max(...recent);
  return { support: support || Math.min(...recent), resistance: resistance || Math.max(...recent) };
}

// Volume-Price Divergence - common trader mistake: ignoring this (IB: volume confirms price moves)
function detectVolumePriceDivergence(closes: number[], volumes: number[], lookback = 10): boolean {
  if (closes.length < lookback || volumes.length < lookback) return false;
  const recentCloses = closes.slice(-lookback);
  const recentVols = volumes.slice(-lookback);
  const priceUp = recentCloses[recentCloses.length - 1] > recentCloses[0];
  const avgVolFirst = recentVols.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const avgVolLast = recentVols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volDown = avgVolLast < avgVolFirst * 0.8;
  // Divergence: price going up but volume declining (or vice versa)
  return (priceUp && volDown) || (!priceUp && !volDown && avgVolLast > avgVolFirst * 1.2);
}

// Volatility Regime (IB: Volatility Lab concept - high IV vs historical IV)
function detectVolatilityRegime(closes: number[]): "high" | "normal" | "low" {
  if (closes.length < 30) return "normal";
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]));
  }
  const recentVol = returns.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const historicalVol = returns.reduce((a, b) => a + b, 0) / returns.length;
  if (recentVol > historicalVol * 1.5) return "high";
  if (recentVol < historicalVol * 0.6) return "low";
  return "normal";
}

// ─── Scoring Helpers ────────────────────────────────────────────────

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

// ─── Macro/Micro Builder ────────────────────────────────────────────

function buildMacroMicro(analysis: AnalysisInput): MacroMicroInfluence {
  const details: MacroMicroInfluence["details"] = [];

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

  const sentimentScore = sentimentToScore(analysis.sentiment);
  const macroScores = details.filter(d => ["Geopolitical Risk", "Macro Economics", "Sector Winds", "Regional Sentiment"].includes(d.label));
  const macroAvg = macroScores.length > 0
    ? macroScores.reduce((sum, d) => sum + impactToScore(d.impact), 0) / macroScores.length
    : 50;

  return { sentimentScore, macroScore: macroAvg, details };
}

// ─── Main Signal Computation ────────────────────────────────────────

export function computeLiveSignals(candles: IntradayCandle[], analysis?: AnalysisInput | null, symbol?: string): LiveSignals | null {
  if (!candles || candles.length < 20) return null;

  const sym = symbol || "UNKNOWN";
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const currentPrice = closes[closes.length - 1];
  const lastVwap = candles[candles.length - 1].vwap;

  verifyPredictions(sym, currentPrice);
  const learnedW = getLearnedWeights(sym);

  // ── Core Technical Indicators ──
  const rsi = computeRSI(closes);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema50 = computeEMA(closes, Math.min(50, closes.length - 1));
  const currentEma9 = ema9[ema9.length - 1];
  const currentEma21 = ema21[ema21.length - 1];
  const currentEma50 = ema50[ema50.length - 1];

  // ── New Enhanced Indicators (IB Academy inspired) ──
  const stochRsi = computeStochRSI(closes);
  const bollinger = computeBollingerBands(closes);
  const macdData = computeMACD(closes);
  const atr = computeATR(candles);
  const { support, resistance } = findSupportResistance(closes);
  const volumePriceDivergence = detectVolumePriceDivergence(closes, volumes);
  const volatilityRegime = detectVolatilityRegime(closes);

  // ── Multi-lookback momentum ──
  const mom3 = closes.length > 3 ? ((currentPrice - closes[closes.length - 4]) / closes[closes.length - 4]) * 100 : 0;
  const mom5 = closes.length > 5 ? ((currentPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
  const mom10 = closes.length > 10 ? ((currentPrice - closes[closes.length - 11]) / closes[closes.length - 11]) * 100 : 0;
  const mom20 = closes.length > 20 ? ((currentPrice - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;
  const momentum = mom5;
  const momAcceleration = mom3 - mom5;

  // ── Volume analysis ──
  const recentVol = volumes.slice(-10);
  const olderVol = volumes.slice(-20, -10);
  const avgRecent = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
  const avgOlder = olderVol.length > 0 ? olderVol.reduce((a, b) => a + b, 0) / olderVol.length : avgRecent;
  const volumeTrend: "rising" | "falling" | "stable" = avgRecent > avgOlder * 1.15 ? "rising" : avgRecent < avgOlder * 0.85 ? "falling" : "stable";

  // ── EMA alignment ──
  const emaAlignment = currentEma9 > currentEma21 && currentEma21 > currentEma50 ? "bullish"
    : currentEma9 < currentEma21 && currentEma21 < currentEma50 ? "bearish" : "mixed";
  const trend: "up" | "down" | "flat" = emaAlignment === "bullish" ? "up" : emaAlignment === "bearish" ? "down"
    : currentEma9 > currentEma21 * 1.001 ? "up" : currentEma9 < currentEma21 * 0.999 ? "down" : "flat";

  const vwapDiff = (currentPrice - lastVwap) / lastVwap;
  const priceVsVwap: "above" | "below" | "at" = vwapDiff > 0.001 ? "above" : vwapDiff < -0.001 ? "below" : "at";

  // ── Score each indicator ──
  const rsiScore = rsi > 80 ? 20 : rsi > 70 ? 30 : rsi < 20 ? 80 : rsi < 30 ? 70 : 50 + (50 - rsi) * 0.4;
  const emaScore = emaAlignment === "bullish" ? 75 : emaAlignment === "bearish" ? 25
    : currentEma9 > currentEma21 ? 60 : currentEma9 < currentEma21 ? 40 : 50;
  const vwapScore = vwapDiff > 0.003 ? 70 : vwapDiff > 0.001 ? 60 : vwapDiff < -0.003 ? 30 : vwapDiff < -0.001 ? 40 : 50;
  
  const momRaw = mom5 > 0.2 ? 75 : mom5 > 0.05 ? 62 : mom5 < -0.2 ? 25 : mom5 < -0.05 ? 38 : 50;
  const accelBonus = momAcceleration > 0 ? 5 : momAcceleration < 0 ? -5 : 0;
  const momScore = Math.max(10, Math.min(90, momRaw + accelBonus));

  const volScore = volumeTrend === "rising" && trend === "up" ? 70
    : volumeTrend === "rising" && trend === "down" ? 30
    : volumeTrend === "falling" && trend === "up" ? 45
    : volumeTrend === "falling" && trend === "down" ? 55 : 50;

  // ── NEW: Enhanced indicator scores ──

  // Stochastic RSI score (IB: better than RSI alone in trending markets)
  const stochRsiScore = stochRsi > 85 ? 20 : stochRsi > 75 ? 30 : stochRsi < 15 ? 80 : stochRsi < 25 ? 70 : 50;

  // Bollinger Bands score (IB: Volatility Profile - mean reversion + breakout)
  // Near lower band in uptrend = buy opportunity; near upper band in downtrend = sell
  const bbScore = bollinger.position > 95 ? (trend === "up" ? 60 : 20) // breakout vs overbought
    : bollinger.position > 80 ? (trend === "up" ? 55 : 30)
    : bollinger.position < 5 ? (trend === "down" ? 40 : 80) // breakdown vs oversold
    : bollinger.position < 20 ? (trend === "down" ? 45 : 70)
    : 50;

  // MACD score (IB: trend confirmation is essential)
  const macdScore = macdData.histogram > 0 && macdData.crossover === "bullish" ? 80
    : macdData.histogram > 0 ? 65
    : macdData.histogram < 0 && macdData.crossover === "bearish" ? 20
    : macdData.histogram < 0 ? 35
    : 50;

  // Support/Resistance proximity score
  const distToSupport = (currentPrice - support) / currentPrice;
  const distToResistance = (resistance - currentPrice) / currentPrice;
  const srScore = distToSupport < 0.002 ? 70 // near support = bounce likely
    : distToResistance < 0.002 ? 30 // near resistance = rejection likely
    : distToSupport < distToResistance ? 60 : 40;

  // Volume-Price Divergence score (IB: common mistake - ignoring divergence signals)
  const divScore = volumePriceDivergence ? (trend === "up" ? 35 : 65) : 50; // divergence = reversal signal

  // Volatility Regime adjustment (IB: don't overtrade in low volatility)
  const volRegimeMultiplier = volatilityRegime === "high" ? 1.2 : volatilityRegime === "low" ? 0.7 : 1.0;

  // ── Composite Technical Score ──
  // Core indicators (weighted by learner): 60%
  const coreScore = rsiScore * learnedW.rsi + emaScore * learnedW.ema
    + vwapScore * learnedW.vwap + momScore * learnedW.momentum + volScore * learnedW.volume;
  
  // Enhanced indicators: 40% (new factors from IB Academy)
  const enhancedScore = stochRsiScore * 0.15 + bbScore * 0.20 + macdScore * 0.25 + srScore * 0.20 + divScore * 0.20;

  const technicalScore = coreScore * 0.60 + enhancedScore * 0.40;

  // ── Macro/Micro influence ──
  let macroMicro: MacroMicroInfluence | null = null;
  let fundamentalScore = 50;

  if (analysis) {
    macroMicro = buildMacroMicro(analysis);
    const aiScore = analysis.overallScore;
    const sentScore = macroMicro.sentimentScore;
    const macScore = macroMicro.macroScore;
    const recScore = recommendationToScore(analysis.recommendation);
    const confScore = analysis.confidenceScore ? analysis.confidenceScore : 50;
    fundamentalScore = aiScore * 0.3 + sentScore * 0.2 + macScore * 0.2 + recScore * 0.15 + confScore * 0.15;
  }

  // ── Timeframe predictions ──
  const fundW = learnedW.fundamental;
  const timeframes = [
    { label: "30 sec", seconds: 30, techWeight: Math.max(0.80, 1 - fundW * 0.12) },
    { label: "1 min", seconds: 60, techWeight: Math.max(0.75, 1 - fundW * 0.25) },
    { label: "3 min", seconds: 180, techWeight: Math.max(0.60, 1 - fundW * 0.50) },
    { label: "5 min", seconds: 300, techWeight: Math.max(0.50, 1 - fundW * 0.75) },
    { label: "10 min", seconds: 600, techWeight: Math.max(0.35, 1 - fundW * 1.0) },
    { label: "30 min", seconds: 1800, techWeight: Math.max(0.25, 1 - fundW * 1.5) },
    { label: "1 hour", seconds: 3600, techWeight: Math.max(0.15, 1 - fundW * 1.8) },
  ];

  const candleIntervalSec = candles.length > 1 ? (candles[candles.length - 1].time - candles[candles.length - 2].time) / 1000 : 60;

  // Weighted velocity using multiple lookbacks
  const velocity3 = mom3 / 100 * currentPrice / (3 * candleIntervalSec);
  const velocity5 = mom5 / 100 * currentPrice / (5 * candleIntervalSec);
  const velocity10 = mom10 / 100 * currentPrice / (10 * candleIntervalSec);
  const velocityPerSec = velocity3 * 0.5 + velocity5 * 0.3 + velocity10 * 0.2;

  // Volatility for confidence calculation
  const recentCloses = closes.slice(-30);
  const returns: number[] = [];
  for (let i = 1; i < recentCloses.length; i++) {
    returns.push((recentCloses[i] - recentCloses[i - 1]) / recentCloses[i - 1]);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  const predictions: TimeframePrediction[] = timeframes.map(tf => {
    const tw = analysis ? tf.techWeight : 1;
    const compositeScore = technicalScore * tw + fundamentalScore * (1 - tw);

    // Mean reversion with volatility regime adjustment (IB: Theta-like time decay concept)
    const tfFactor = Math.min(tf.seconds / 60, 10);
    const reversionStrength = tf.seconds <= 60 ? 0.005 : tf.seconds <= 300 ? 0.01 : 0.02;
    const reversion = (50 - compositeScore) * reversionStrength * tfFactor;
    
    // Volatility regime dampens/amplifies signals (IB: don't trade aggressively in low vol)
    const adjustedScore = Math.max(0, Math.min(100, (compositeScore + reversion - 50) * volRegimeMultiplier + 50));

    // ATR-adjusted price projection (IB: use ATR for realistic price targets)
    const projectedMove = velocityPerSec * tf.seconds;
    const accelFactor = tf.seconds <= 180 ? momAcceleration / 100 * currentPrice * tf.seconds * 0.001 : 0;
    const fundBias = (fundamentalScore - 50) / 50 * 0.001 * tf.seconds * (1 - tw);
    
    // Support/Resistance clamping (IB: prices tend to bounce off levels)
    let predictedPrice = currentPrice + projectedMove + accelFactor + currentPrice * fundBias;
    // Soft clamp: if predicted price breaks S/R, reduce confidence
    const breaksSR = predictedPrice > resistance * 1.005 || predictedPrice < support * 0.995;
    
    const baseConfidence = 85;
    const timeDecay = Math.max(0.3, 1 - (tf.seconds / 7200));
    const volPenalty = Math.max(0.4, 1 - volatility * 50);
    const analysisBonusConf = analysis ? 1.1 : 1;
    const srPenalty = breaksSR ? 0.9 : 1.0;
    const divPenalty = volumePriceDivergence ? 0.92 : 1.0;
    const confidence = Math.min(95, Math.round(baseConfidence * timeDecay * volPenalty * analysisBonusConf * srPenalty * divPenalty));

    // Build detailed reasoning
    const parts: string[] = [];
    if (tw >= 0.5) {
      parts.push(`RSI ${rsi.toFixed(0)} StochRSI ${stochRsi.toFixed(0)} | EMA ${emaAlignment} | MACD ${macdData.histogram > 0 ? "+" : ""}${macdData.histogram.toFixed(3)}${macdData.crossover !== "neutral" ? ` [${macdData.crossover}×]` : ""}`);
      parts.push(`BB ${bollinger.position.toFixed(0)}% | S/R ${support.toFixed(2)}–${resistance.toFixed(2)} | Vol ${volatilityRegime}`);
    }
    if (analysis && tw < 1) {
      parts.push(`Fund: ${analysis.sentiment} score ${analysis.overallScore}${analysis.recommendation ? ` ${analysis.recommendation}` : ""}`);
    }
    if (volumePriceDivergence) parts.push("⚠ Vol-Price Divergence");
    if (momAcceleration !== 0) parts.push(`Accel ${momAcceleration > 0 ? "↑" : "↓"}`);

    const predContext: PredictionContext = {
      rsi, stochRsi, emaAlignment, macdHistogram: macdData.histogram, macdCrossover: macdData.crossover,
      bollingerPosition: bollinger.position, atr, support, resistance, vwap: lastVwap,
      momentum, volumeTrend, volatilityRegime, volumePriceDivergence, trend,
      technicalScore, fundamentalScore, compositeScore: compositeScore,
      techWeight: tw, weights: { ...learnedW },
      sentiment: analysis?.sentiment, overallAIScore: analysis?.overallScore,
      recommendation: analysis?.recommendation,
      macroDetails: macroMicro?.details.map(d => ({ label: d.label, impact: d.impact, summary: d.summary })),
      reasoning: parts.join(" | "),
    };

    recordPrediction(sym, tf.seconds, predictedPrice, currentPrice, predContext);

    return {
      label: tf.label,
      seconds: tf.seconds,
      signal: getSignal(adjustedScore),
      confidence,
      predictedPrice,
      predictedChange: ((predictedPrice - currentPrice) / currentPrice) * 100,
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
    bollingerPosition: bollinger.position,
    macdSignal: macdData.histogram > 0 ? "bullish" : macdData.histogram < 0 ? "bearish" : "neutral",
    stochRsi,
    atr,
    volatilityRegime,
    supportLevel: support,
    resistanceLevel: resistance,
    volumePriceDivergence,
  };
}
