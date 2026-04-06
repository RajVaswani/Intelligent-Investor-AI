/**
 * Trade Persistence Store
 * 
 * Persists active trades and trade history in localStorage so trades
 * survive page refreshes. Open trades resume processing on reload.
 */

export interface PersistedTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  direction: "LONG" | "SHORT";
  exitPrice: number | null;
  exitTime: string | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "OPEN" | "CLOSED";
  closedAt: number | null;
  openedAt: number;
  reason: string;
  confidence: number;
  fedToLearner: boolean;
}

const TRADES_KEY = "auto_trader_trades";
const MAX_HISTORY = 500;

function getStoreKey(symbol: string) {
  return `${TRADES_KEY}_${symbol}`;
}

export function loadTrades(symbol: string): PersistedTrade[] {
  try {
    const raw = localStorage.getItem(getStoreKey(symbol));
    if (raw) return JSON.parse(raw) as PersistedTrade[];
  } catch { /* ignore */ }
  return [];
}

export function saveTrades(symbol: string, trades: PersistedTrade[]): void {
  try {
    // Keep last MAX_HISTORY trades
    const trimmed = trades.slice(-MAX_HISTORY);
    localStorage.setItem(getStoreKey(symbol), JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

export function loadAllSymbolTrades(symbols: string[]): Record<string, PersistedTrade[]> {
  const result: Record<string, PersistedTrade[]> = {};
  for (const sym of symbols) {
    result[sym] = loadTrades(sym);
  }
  return result;
}

/** Get aggregate stats across all symbols */
export function getGlobalTradeStats(symbols: string[]): {
  totalPnl: number;
  realized: number;
  wins: number;
  losses: number;
  totalTrades: number;
  openTrades: number;
} {
  let totalPnl = 0, realized = 0, wins = 0, losses = 0, totalTrades = 0, openTrades = 0;
  for (const sym of symbols) {
    const trades = loadTrades(sym);
    for (const t of trades) {
      totalTrades++;
      if (t.status === "CLOSED") {
        realized += t.pnl || 0;
        totalPnl += t.pnl || 0;
        if ((t.pnl || 0) > 0) wins++;
        else losses++;
      } else {
        openTrades++;
      }
    }
  }
  return { totalPnl, realized, wins, losses, totalTrades, openTrades };
}
