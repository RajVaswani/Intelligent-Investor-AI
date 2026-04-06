/**
 * Recursive Learning Engine
 * 
 * Tracks prediction accuracy over time and adjusts indicator weights
 * to improve future buy/sell signals. Uses in-memory storage per session
 * with localStorage persistence. Supports historical data replay for
 * bootstrapping the learner with 60 days of past data.
 */

import type { IntradayCandle } from "@/lib/api/optionsData";

export interface PredictionContext {
  rsi: number;
  stochRsi: number;
  emaAlignment: string;
  macdHistogram: number;
  macdCrossover: string;
  bollingerPosition: number;
  atr: number;
  support: number;
  resistance: number;
  vwap: number;
  momentum: number;
  volumeTrend: string;
  volatilityRegime: string;
  volumePriceDivergence: boolean;
  trend: string;
  // Composite scores
  technicalScore: number;
  fundamentalScore: number;
  compositeScore: number;
  techWeight: number;
  // Macro/micro
  sentiment?: string;
  overallAIScore?: number;
  recommendation?: string | null;
  macroDetails?: { label: string; impact: string; summary: string }[];
  // Weights used
  weights: IndicatorAccuracy;
  reasoning: string;
}

export interface PredictionRecord {
  timestamp: number;
  symbol: string;
  timeframeSeconds: number;
  predictedPrice: number;
  actualPriceAtPrediction: number;
  predictedDirection: "up" | "down" | "flat";
  context?: PredictionContext;
  // filled in later when we can verify
  actualPrice?: number;
  wasCorrect?: boolean;
  error?: number; // percentage error
}

export interface IndicatorAccuracy {
  rsi: number;
  ema: number;
  vwap: number;
  momentum: number;
  volume: number;
  fundamental: number;
}

export interface AccuracySnapshot {
  timestamp: number;
  overall: number;
  byTimeframe: Record<number, number>;
  totalPredictions: number;
}

export interface LearningState {
  predictions: PredictionRecord[];
  weights: IndicatorAccuracy;
  totalPredictions: number;
  correctPredictions: number;
  accuracyByTimeframe: Record<number, { total: number; correct: number }>;
  accuracyHistory: AccuracySnapshot[];
  lastUpdated: number;
}

const STORAGE_KEY = "signal_learning_state";
const MAX_PREDICTIONS = 500; // keep last 500 predictions

function defaultWeights(): IndicatorAccuracy {
  return { rsi: 0.25, ema: 0.25, vwap: 0.20, momentum: 0.20, volume: 0.10, fundamental: 0.40 };
}

function loadState(symbol: string): LearningState {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${symbol}`);
    if (raw) {
      const state = JSON.parse(raw) as LearningState;
      // Validate weights sum roughly to expected values
      if (state.weights && state.predictions) {
        if (!state.accuracyHistory) state.accuracyHistory = [];
        if (!state.accuracyByTimeframe) state.accuracyByTimeframe = {};
        return state;
      }
    }
  } catch { /* ignore */ }
  return {
    predictions: [],
    weights: defaultWeights(),
    totalPredictions: 0,
    correctPredictions: 0,
    accuracyByTimeframe: {},
    accuracyHistory: [],
    lastUpdated: Date.now(),
  };
}

function saveState(symbol: string, state: LearningState) {
  try {
    // Trim old predictions
    if (state.predictions.length > MAX_PREDICTIONS) {
      state.predictions = state.predictions.slice(-MAX_PREDICTIONS);
    }
    localStorage.setItem(`${STORAGE_KEY}_${symbol}`, JSON.stringify(state));
  } catch { /* storage full, ignore */ }
}

/**
 * Record a new prediction for future verification
 */
export function recordPrediction(
  symbol: string,
  timeframeSeconds: number,
  predictedPrice: number,
  currentPrice: number,
  context?: PredictionContext,
): void {
  const state = loadState(symbol);
  const predictedDirection: "up" | "down" | "flat" =
    predictedPrice > currentPrice * 1.0001 ? "up" :
    predictedPrice < currentPrice * 0.9999 ? "down" : "flat";

  state.predictions.push({
    timestamp: Date.now(),
    symbol,
    timeframeSeconds,
    predictedPrice,
    actualPriceAtPrediction: currentPrice,
    predictedDirection,
    context,
  });

  saveState(symbol, state);
}

/**
 * Get predictions filtered by timeframe for drill-down UI
 */
export function getPredictionsByTimeframe(
  symbol: string,
  timeframeSeconds?: number,
): PredictionRecord[] {
  const state = loadState(symbol);
  const preds = state.predictions.filter(p => p.wasCorrect !== undefined);
  if (timeframeSeconds !== undefined) {
    return preds.filter(p => p.timeframeSeconds === timeframeSeconds).slice(-100);
  }
  return preds.slice(-200);
}

/**
 * Verify past predictions against current price and update accuracy
 */
export function verifyPredictions(symbol: string, currentPrice: number): void {
  const state = loadState(symbol);
  const now = Date.now();
  let changed = false;

  for (const pred of state.predictions) {
    if (pred.wasCorrect !== undefined) continue; // already verified

    const elapsed = (now - pred.timestamp) / 1000;
    // Only verify if enough time has passed (with 20% tolerance)
    if (elapsed < pred.timeframeSeconds * 0.8) continue;
    // Don't verify if too old (3x the timeframe)
    if (elapsed > pred.timeframeSeconds * 3) {
      pred.wasCorrect = false; // expired, mark as unknown/wrong
      pred.actualPrice = currentPrice;
      pred.error = 100;
      changed = true;
      continue;
    }

    pred.actualPrice = currentPrice;
    const actualDirection: "up" | "down" | "flat" =
      currentPrice > pred.actualPriceAtPrediction * 1.0001 ? "up" :
      currentPrice < pred.actualPriceAtPrediction * 0.9999 ? "down" : "flat";

    // Direction match = correct
    pred.wasCorrect = pred.predictedDirection === actualDirection ||
      (pred.predictedDirection === "flat" && Math.abs(currentPrice - pred.actualPriceAtPrediction) / pred.actualPriceAtPrediction < 0.002);

    pred.error = Math.abs(currentPrice - pred.predictedPrice) / pred.actualPriceAtPrediction * 100;

    // Update aggregate stats
    state.totalPredictions++;
    if (pred.wasCorrect) state.correctPredictions++;

    if (!state.accuracyByTimeframe[pred.timeframeSeconds]) {
      state.accuracyByTimeframe[pred.timeframeSeconds] = { total: 0, correct: 0 };
    }
    state.accuracyByTimeframe[pred.timeframeSeconds].total++;
    if (pred.wasCorrect) state.accuracyByTimeframe[pred.timeframeSeconds].correct++;

    changed = true;
  }

  if (changed) {
    state.lastUpdated = now;
    adjustWeights(state);

    // Record accuracy snapshot (max 200 points)
    const overallAcc = state.totalPredictions > 0
      ? (state.correctPredictions / state.totalPredictions) * 100 : 0;
    const tfSnap: Record<number, number> = {};
    for (const [tf, d] of Object.entries(state.accuracyByTimeframe)) {
      tfSnap[Number(tf)] = d.total > 0 ? (d.correct / d.total) * 100 : 0;
    }
    state.accuracyHistory.push({
      timestamp: now,
      overall: overallAcc,
      byTimeframe: tfSnap,
      totalPredictions: state.totalPredictions,
    });
    if (state.accuracyHistory.length > 200) {
      state.accuracyHistory = state.accuracyHistory.slice(-200);
    }

    saveState(symbol, state);
  }
}

/**
 * Adjust indicator weights based on prediction accuracy patterns
 */
function adjustWeights(state: LearningState): void {
  if (state.totalPredictions < 5) return; // need minimum data

  const accuracy = state.correctPredictions / state.totalPredictions;
  const weights = state.weights;
  const lr = 0.02; // learning rate

  // Analyze recent verified predictions to find patterns
  const recent = state.predictions
    .filter(p => p.wasCorrect !== undefined)
    .slice(-50);

  if (recent.length < 5) return;

  const correctOnes = recent.filter(p => p.wasCorrect);
  const wrongOnes = recent.filter(p => !p.wasCorrect);

  // If accuracy is below 50%, we need to shift weights significantly
  if (accuracy < 0.45) {
    // Predictions are mostly wrong - likely fighting momentum
    // Increase momentum weight, decrease mean-reversion indicators
    weights.momentum = Math.min(0.35, weights.momentum + lr * 2);
    weights.ema = Math.min(0.35, weights.ema + lr);
    weights.rsi = Math.max(0.10, weights.rsi - lr);
    weights.vwap = Math.max(0.05, weights.vwap - lr);
  } else if (accuracy > 0.65) {
    // Good accuracy - reinforce current weights slightly
    // but don't over-fit
  } else {
    // Middling accuracy - try to improve
    // Check if short-term predictions are worse than long-term
    const shortTF = recent.filter(p => p.timeframeSeconds <= 60);
    const longTF = recent.filter(p => p.timeframeSeconds >= 600);

    const shortAcc = shortTF.length > 2
      ? shortTF.filter(p => p.wasCorrect).length / shortTF.length : 0.5;
    const longAcc = longTF.length > 2
      ? longTF.filter(p => p.wasCorrect).length / longTF.length : 0.5;

    if (shortAcc < 0.4) {
      // Short-term predictions bad - increase momentum sensitivity
      weights.momentum = Math.min(0.35, weights.momentum + lr);
      weights.volume = Math.min(0.20, weights.volume + lr * 0.5);
    }
    if (longAcc < 0.4) {
      // Long-term predictions bad - increase fundamental weight
      weights.fundamental = Math.min(0.55, weights.fundamental + lr);
    }
  }

  // Normalize technical weights to sum to 1.0
  const techSum = weights.rsi + weights.ema + weights.vwap + weights.momentum + weights.volume;
  if (techSum > 0) {
    weights.rsi /= techSum;
    weights.ema /= techSum;
    weights.vwap /= techSum;
    weights.momentum /= techSum;
    weights.volume /= techSum;
  }

  // Clamp fundamental weight
  weights.fundamental = Math.max(0.20, Math.min(0.60, weights.fundamental));
}

/**
 * Get learned weights for signal computation
 */
export function getLearnedWeights(symbol: string): IndicatorAccuracy {
  return loadState(symbol).weights;
}

/**
 * Get accuracy stats for display
 */
export function getAccuracyStats(symbol: string): {
  overall: number;
  total: number;
  correct: number;
  byTimeframe: Record<number, { accuracy: number; total: number }>;
  weights: IndicatorAccuracy;
  history: AccuracySnapshot[];
} {
  const state = loadState(symbol);
  const overall = state.totalPredictions > 0
    ? (state.correctPredictions / state.totalPredictions) * 100 : 0;

  const byTimeframe: Record<number, { accuracy: number; total: number }> = {};
  for (const [tf, data] of Object.entries(state.accuracyByTimeframe)) {
    byTimeframe[Number(tf)] = {
      accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
      total: data.total,
    };
  }

  return {
    overall,
    total: state.totalPredictions,
    correct: state.correctPredictions,
    byTimeframe,
    weights: state.weights,
    history: state.accuracyHistory || [],
  };
}

/**
 * Replay historical candles through the learning engine.
 * Simulates predictions at each candle and verifies against future candles.
 * This bootstraps the learner with 60 days of data for better accuracy.
 */
export function replayHistoricalData(
  symbol: string,
  candles: IntradayCandle[],
): { predictionsGenerated: number; verified: number } {
  if (!candles || candles.length < 50) return { predictionsGenerated: 0, verified: 0 };

  const state = loadState(symbol);
  
  // Check if we already have enough historical data loaded
  const HISTORY_KEY = `${STORAGE_KEY}_${symbol}_hist`;
  try {
    const existing = localStorage.getItem(HISTORY_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      // If we replayed within last hour with similar candle count, skip
      if (parsed.count >= candles.length * 0.9 && Date.now() - parsed.ts < 3600000) {
        return { predictionsGenerated: 0, verified: 0 };
      }
    }
  } catch { /* ignore */ }

  const timeframes = [60, 300, 600, 1800, 3600]; // 1m, 5m, 10m, 30m, 1h
  let generated = 0;
  let verified = 0;

  // Walk through candles, simulating predictions
  // Step by ~20 candles to avoid excessive data
  const step = Math.max(1, Math.floor(candles.length / 500));
  
  for (let i = 50; i < candles.length - 10; i += step) {
    const windowCandles = candles.slice(Math.max(0, i - 50), i + 1);
    const closes = windowCandles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const currentTime = windowCandles[windowCandles.length - 1].time;

    // Simple momentum-based prediction (mirrors signal engine logic)
    const mom5 = closes.length > 5 
      ? ((currentPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
    const velocityPerSec = (mom5 / 100) * currentPrice / (5 * 60); // approximate

    for (const tf of timeframes) {
      const predictedPrice = currentPrice + velocityPerSec * tf;
      const predictedDirection: "up" | "down" | "flat" =
        predictedPrice > currentPrice * 1.0001 ? "up" :
        predictedPrice < currentPrice * 0.9999 ? "down" : "flat";

      // Find the actual price at the target time
      const targetTime = currentTime + tf * 1000;
      const futureCandle = candles.find(c => c.time >= targetTime);
      
      if (futureCandle) {
        const actualPrice = futureCandle.close;
        const actualDirection: "up" | "down" | "flat" =
          actualPrice > currentPrice * 1.0001 ? "up" :
          actualPrice < currentPrice * 0.9999 ? "down" : "flat";

        const wasCorrect = predictedDirection === actualDirection ||
          (predictedDirection === "flat" && Math.abs(actualPrice - currentPrice) / currentPrice < 0.002);

        state.predictions.push({
          timestamp: currentTime,
          symbol,
          timeframeSeconds: tf,
          predictedPrice,
          actualPriceAtPrediction: currentPrice,
          predictedDirection,
          actualPrice,
          wasCorrect,
          error: Math.abs(actualPrice - predictedPrice) / currentPrice * 100,
        });

        state.totalPredictions++;
        if (wasCorrect) state.correctPredictions++;

        if (!state.accuracyByTimeframe[tf]) {
          state.accuracyByTimeframe[tf] = { total: 0, correct: 0 };
        }
        state.accuracyByTimeframe[tf].total++;
        if (wasCorrect) state.accuracyByTimeframe[tf].correct++;

        verified++;
      }

      generated++;
    }
  }

  // Adjust weights based on all this new data
  if (verified > 10) {
    adjustWeights(state);

    // Record a summary accuracy snapshot
    const overallAcc = state.totalPredictions > 0
      ? (state.correctPredictions / state.totalPredictions) * 100 : 0;
    const tfSnap: Record<number, number> = {};
    for (const [tf, d] of Object.entries(state.accuracyByTimeframe)) {
      tfSnap[Number(tf)] = d.total > 0 ? (d.correct / d.total) * 100 : 0;
    }
    state.accuracyHistory.push({
      timestamp: Date.now(),
      overall: overallAcc,
      byTimeframe: tfSnap,
      totalPredictions: state.totalPredictions,
    });
  }

  state.lastUpdated = Date.now();
  saveState(symbol, state);

  // Mark as replayed
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ ts: Date.now(), count: candles.length }));
  } catch { /* ignore */ }

  return { predictionsGenerated: generated, verified };
}
