/**
 * Recursive Learning Engine
 * 
 * Tracks prediction accuracy over time and adjusts indicator weights
 * to improve future buy/sell signals. Uses in-memory storage per session
 * with localStorage persistence.
 */

export interface PredictionRecord {
  timestamp: number;
  symbol: string;
  timeframeSeconds: number;
  predictedPrice: number;
  actualPriceAtPrediction: number;
  predictedDirection: "up" | "down" | "flat";
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
  currentPrice: number
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
  });

  saveState(symbol, state);
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
