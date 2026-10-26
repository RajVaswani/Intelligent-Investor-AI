# The Intelligent Investor

AI-driven market intelligence for Nifty 50 and S&P 500 — micro and macro research,
multi-horizon price predictions, a self-improving signal engine, and an auto-trading
simulator that proves its own calls against real market data.

> AI-generated analysis. Not financial advice.

## The Brief

Most retail investors get either a charting tool or a newsletter. Neither tells you
*why* a stock is moving, *what* it might do next, or whether the system is actually
right. The Intelligent Investor closes that loop:

1. **It reads the company.** Every stock gets an AI research pass — financials, news,
   the company's own website, competitive position and management outlook — with the
   sources cited, not just asserted.
2. **It reads the world.** A separate macro pass weighs geopolitical risk, sector
   tailwinds, regional sentiment, macro-economic pressure and media manipulation,
   then flags controversy and stock-split distortions that would otherwise skew a call.
3. **It makes a call.** A signal engine blends those fundamentals with live technicals
   (RSI, MACD, Bollinger, VWAP, volume, trend) into predictions across eight horizons —
   30 seconds to 24 hours — each with a confidence score and its reasoning.
4. **It proves the call.** Every prediction is checked against what the market actually
   did at 1, 5 and 10 minutes. Wins and losses are logged, and those outcomes feed back
   into the engine's indicator weights. The system is graded on its own track record,
   and it gets better (or admits it doesn't) with evidence.
5. **It trades itself.** A $10,000 virtual portfolio takes LONG/SHORT positions on the
   best available prediction, books profit at +0.15% and cuts loss at -0.20%, and keeps
   a permanent trade log per symbol. No cherry-picking, no hindsight: the P&L you see is
   the P&L the strategy actually produced.

The name is a nod to Graham's idea — discipline over hype, a margin of safety, and
letting results argue for you.

## What's Inside

| Area | What you get |
| --- | --- |
| **Market Dashboard** | Nifty 50 (51 names) and S&P 500 coverage, sector breakdown, AI scores and sentiment at a glance |
| **Stock Detail** | Micro analysis, macro & geopolitical analysis, strengths/risks, cited sources, price predictions |
| **Portfolio** | Live P&L refreshing every second, Monte Carlo stress testing, VaR / Sharpe / concentration risk, ROI planner across bullish / base / bearish cases, per-holding detail with 1-day to 1-year targets |
| **IBKR Sync** | Connect Interactive Brokers via Flex Query and import holdings automatically; two-step polling, credentials held per-user under row-level security |
| **Options Trading** | Live option chain, Greeks, VWAP, multi-leg strategy builder, intraday analysis, contextual AI chat about the stock you're looking at |
| **Options Master** | Fifteen symbols auto-trading simultaneously, aggregate P&L and win rate, a single live feed of every closed trade |
| **Signal Evidence** | Each call graded against real prices at 1, 5 and 10 minutes — win or loss, with exact dollars and percentages |
| **Recursive Learning** | Indicator weights (RSI, EMA, VWAP, momentum, volume, fundamentals) shift after every verified outcome, per symbol, visible live |
| **Access** | Email and Google sign-in, password reset, protected routes, admin console with role-based access |

## Predictions & Timeframes

- **Signal engine:** 30 sec, 1 min, 3 min, 5 min, 10 min, 30 min, 1 hour, 24 hours —
  short horizons lean technical, long horizons lean fundamental, and every move is
  clamped to a realistic range (ATR-scaled) rather than extrapolated into fantasy.
- **AI analysis:** 1 day, 1 week, 1 month, 3 months, 1 year targets with confidence.
- **Valuations always use live market prices**, never a forecast — portfolio P&L is
  what the market says it is.

## The Auto-Trader

| Setting | Value |
| --- | --- |
| Starting capital | $10,000 per symbol |
| Position size | $1,000 per trade |
| Take profit | +0.15% |
| Stop loss | -0.20% |
| Max hold | 5 minutes |
| Trade gap | 1 second |

Trades are persisted locally, so an open position keeps running across a page refresh
and closed trades stay in the log (up to 500 per symbol). A trade is written once, when
it closes and its profit or loss is realised. Every outcome is fed back into the
learning engine, which is what makes the next call better informed than the last.

## Architecture

```text
React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
        |
        +-- signalEngine.ts     composite scoring, 8 horizons, live recompute
        +-- signalLearner.ts    prediction records, verification, weight updates
        +-- tradeStore.ts       persisted trade log per symbol
        |
        +-- Edge functions
              analyze-company   Firecrawl scrape + Gemini research pass
              stock-data        live quotes, intraday series
              options-data      option chain, Greeks
              options-strategy  multi-leg builder
              ibkr-portfolio    Flex Query holdings sync
              stock-chat        contextual assistant
        |
        +-- Backend (Lovable Cloud / Postgres + RLS)
              profiles, user_roles, analyses, user_secrets
```

- **Market data:** TradingView charts (`NSE:` prefix for Indian names, plain tickers
  for US) and Yahoo Finance prices (`.NS` suffix for Indian, `^NSEI`-style tickers for
  indices).
- **Refresh cadence:** market data every 30s, portfolio prices every 1s, high-frequency
  views every 1s.
- **Currency:** ₹ for Nifty 50 names, $ for S&P 500 names, chosen per symbol.

## Getting Started

```bash
bun install
bun run dev
```

The app reads its backend from `.env` (`VITE_SUPABASE_URL`, publishable key). Database
schema lives in `supabase/migrations`; edge functions in `supabase/functions`.

```bash
bun run test     # vitest
bun run lint     # eslint
bun run build    # production bundle
```

## Status

Free during beta — full access to every feature. $10/mo when beta ends.
