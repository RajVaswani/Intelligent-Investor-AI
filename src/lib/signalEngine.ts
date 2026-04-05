import type { IntradayCandle } from "@/lib/api/optionsData";

export type Signal = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

export interface TimeframePrediction {
  label: string;
  seconds: number;
  signal: Signal;
  confidence: number; // 0-100
  predictedPrice: number;
  predictedChange: number; // percent
}

export interface LiveSignals {
  currentPrice: number;
  vwap: number;
  rsi: number;
  momentum: number; // percent
  trend: "up" | "down" | "flat";
  volumeTrend: "rising" | "falling" | "stable";
  priceVsVwap: "above" | "below" | "at";
  predictions: TimeframePrediction[];
  updatedAt: number;
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

export function computeLiveSignals(candles: IntradayCandle[]): LiveSignals | null {
  if (!candles || candles.length < 20) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const currentPrice = closes[closes.length - 1];
  const lastVwap = candles[candles.length - 1].vwap;

  // RSI
  const rsi = computeRSI(closes);

  // EMAs
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const currentEma9 = ema9[ema9.length - 1];
  const currentEma21 = ema21[ema21.length - 1];

  // Momentum (last 5 candles rate of change)
  const lookback = Math.min(5, closes.length - 1);
  const momentum = ((currentPrice - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100;

  // Volume trend
  const recentVol = volumes.slice(-10);
  const olderVol = volumes.slice(-20, -10);
  const avgRecent = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
  const avgOlder = olderVol.length > 0 ? olderVol.reduce((a, b) => a + b, 0) / olderVol.length : avgRecent;
  const volumeTrend: "rising" | "falling" | "stable" = avgRecent > avgOlder * 1.15 ? "rising" : avgRecent < avgOlder * 0.85 ? "falling" : "stable";

  // Trend
  const trend: "up" | "down" | "flat" = currentEma9 > currentEma21 * 1.001 ? "up" : currentEma9 < currentEma21 * 0.999 ? "down" : "flat";

  // Price vs VWAP
  const vwapDiff = (currentPrice - lastVwap) / lastVwap;
  const priceVsVwap: "above" | "below" | "at" = vwapDiff > 0.001 ? "above" : vwapDiff < -0.001 ? "below" : "at";

  // Composite score (0-100, >50 = bullish)
  const rsiScore = rsi > 70 ? 30 : rsi < 30 ? 70 : 50 + (50 - rsi) * 0.4;
  const emaScore = currentEma9 > currentEma21 ? 65 : currentEma9 < currentEma21 ? 35 : 50;
  const vwapScore = priceVsVwap === "above" ? 60 : priceVsVwap === "below" ? 40 : 50;
  const momScore = momentum > 0.1 ? 65 : momentum < -0.1 ? 35 : 50;
  const volScore = volumeTrend === "rising" && trend === "up" ? 65 : volumeTrend === "rising" && trend === "down" ? 35 : 50;

  const baseScore = rsiScore * 0.25 + emaScore * 0.25 + vwapScore * 0.2 + momScore * 0.2 + volScore * 0.1;

  // Timeframe predictions
  const timeframes = [
    { label: "30 sec", seconds: 30 },
    { label: "1 min", seconds: 60 },
    { label: "3 min", seconds: 180 },
    { label: "5 min", seconds: 300 },
    { label: "10 min", seconds: 600 },
    { label: "30 min", seconds: 1800 },
    { label: "1 hour", seconds: 3600 },
  ];

  // Use recent price velocity to project
  const recentCloses = closes.slice(-30);
  const velocity = recentCloses.length > 1 
    ? (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses.length 
    : 0;
  const candleIntervalSec = candles.length > 1 ? (candles[candles.length - 1].time - candles[candles.length - 2].time) / 1000 : 60;
  const velocityPerSec = velocity / candleIntervalSec;

  // Volatility for confidence decay
  const returns = [];
  for (let i = 1; i < recentCloses.length; i++) {
    returns.push((recentCloses[i] - recentCloses[i - 1]) / recentCloses[i - 1]);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  const predictions: TimeframePrediction[] = timeframes.map(tf => {
    // Mean-revert the score slightly for longer timeframes
    const tfFactor = Math.min(tf.seconds / 60, 10);
    const reversion = (50 - baseScore) * 0.02 * tfFactor;
    const adjustedScore = Math.max(0, Math.min(100, baseScore + reversion));

    // Project price
    const projectedMove = velocityPerSec * tf.seconds;
    const predictedPrice = currentPrice + projectedMove;
    const predictedChange = (projectedMove / currentPrice) * 100;

    // Confidence decays with time and volatility
    const baseConfidence = 85;
    const timeDecay = Math.max(0.3, 1 - (tf.seconds / 7200));
    const volPenalty = Math.max(0.4, 1 - volatility * 50);
    const confidence = Math.round(baseConfidence * timeDecay * volPenalty);

    return {
      label: tf.label,
      seconds: tf.seconds,
      signal: getSignal(adjustedScore),
      confidence,
      predictedPrice,
      predictedChange,
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
    updatedAt: Date.now(),
  };
}
