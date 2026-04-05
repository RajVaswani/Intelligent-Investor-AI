import { useState, useEffect } from "react";
import {
  X, ChevronRight, ChevronLeft, BarChart3, Brain, TrendingUp, Shield,
  Globe, Zap, PieChart, Target, MessageSquare, Search, Filter, RefreshCw,
  LineChart, Activity, Briefcase
} from "lucide-react";

interface Step {
  title: string;
  description: string;
  icon: React.ElementType;
  details: string[];
  page?: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to StockPulse AI",
    icon: Activity,
    description: "Your AI-powered stock analysis platform. Here's what each feature does and how to use it.",
    details: [
      "StockPulse AI automatically analyzes every stock in Nifty 50 and S&P 500 using advanced AI models.",
      "All analyses auto-refresh every 30 seconds to keep data current.",
      "This guide will walk you through every feature — let's get started!",
    ],
  },
  {
    title: "Market Dashboard",
    icon: BarChart3,
    description: "The main hub showing all stocks with real-time analysis.",
    details: [
      "📊 ETF Tabs — Switch between Nifty 50 (Indian market) and S&P 500 (US market) at the top.",
      "🔍 Search & Filter — Search any stock by symbol or name. Filter by sector to focus on specific industries.",
      "📈 Live ETF Chart — Real-time price chart powered by Yahoo Finance, auto-refreshing every 30 seconds.",
      "🏷️ Stats Bar — Quick overview of average scores, sentiment breakdown, and sector distribution across all analyzed stocks.",
      "🃏 Company Cards — Each card shows the AI score (0-100), sentiment (bullish/bearish/neutral), and key stats. Click any card to see full analysis.",
    ],
    page: "/market",
  },
  {
    title: "AI Analysis Scores",
    icon: Brain,
    description: "Understanding the AI scoring system on each stock card.",
    details: [
      "🟢 Score 70-100 (Green) — Strong fundamentals, positive outlook. AI sees bullish signals.",
      "🟡 Score 40-69 (Yellow) — Mixed signals, neutral stance. Worth watching but not a clear call.",
      "🔴 Score 0-39 (Red) — Concerning signals detected. AI sees bearish indicators.",
      "The score combines: financial health, news sentiment, website insights, sector trends, and macro factors.",
      "Confidence Score tells you how certain the AI is in its analysis (higher = more data available).",
    ],
  },
  {
    title: "Stock Detail Page",
    icon: LineChart,
    description: "Click any company card to see the full deep-dive analysis.",
    details: [
      "📈 Real-Time Chart — Live price chart for the individual stock with 30-second refresh.",
      "💡 AI Summary — One-paragraph overview of the stock's current situation.",
      "🌐 Website Insights — What the AI found from scanning the company's official website.",
      "💰 Financial Highlights — Key financial metrics and recent earnings data.",
      "📰 News Digest — Summary of recent news coverage and its sentiment impact.",
      "💪 Strengths & ⚠️ Risks — Bullet-point breakdown of positive and negative factors.",
    ],
    page: "/stock/:symbol",
  },
  {
    title: "Price Predictions",
    icon: TrendingUp,
    description: "AI-generated price targets and buy/sell recommendations.",
    details: [
      "🎯 Price Targets — Predictions for 1 week, 1 month, 3 months, and 1 year timeframes.",
      "📊 Recommendation — Buy, Hold, or Sell based on combined analysis.",
      "🔢 Confidence Score — How confident the AI is in the prediction (0-100%).",
      "📝 Reasoning — Detailed explanation of why the AI made this prediction.",
      "⚠️ These are AI-generated estimates, not financial advice. Always do your own research.",
    ],
  },
  {
    title: "Macro & Geopolitical Analysis",
    icon: Globe,
    description: "Deep analysis of external factors affecting each stock.",
    details: [
      "🌍 Geopolitical Analysis — How global events (wars, trade deals, elections) impact the stock.",
      "🏭 Sector Tailwinds/Headwinds — Industry trends helping or hurting the stock's sector.",
      "📊 Macro-Economic Factors — Interest rates, inflation, GDP growth impact on the stock.",
      "🔍 Controversy Scanner — Checks for scandals, lawsuits, or ESG issues.",
      "🗞️ Media Manipulation Check — Detects potential pump-and-dump or coordinated media campaigns.",
      "🌏 Regional Sentiment — How the stock is perceived in different geographic markets.",
    ],
  },
  {
    title: "Portfolio Dashboard",
    icon: Briefcase,
    description: "Your personal portfolio with holdings, analysis, and risk metrics.",
    details: [
      "➕ Add Holdings — Manually add stocks with symbol, quantity, and average price.",
      "🔗 IBKR Sync — Connect your Interactive Brokers account for automatic portfolio import.",
      "📊 Portfolio Analysis — AI analyzes every holding in your portfolio automatically.",
      "💼 Sector Allocation — See how your portfolio is distributed across sectors.",
      "🔄 Auto-Sync — IBKR portfolios refresh every 30 seconds for real-time accuracy.",
    ],
    page: "/dashboard",
  },
  {
    title: "Risk Analytics (Aladdin-Inspired)",
    icon: Shield,
    description: "Professional-grade risk tools modeled after BlackRock's Aladdin system.",
    details: [
      "🎲 Monte Carlo Simulation — Runs thousands of random scenarios to project your portfolio's future value range.",
      "📊 Risk Radar — Spider chart showing VaR, Sharpe Ratio, Beta, Volatility, and Max Drawdown at a glance.",
      "🥧 Sector Concentration — Pie chart showing sector allocation with warnings for over-concentration.",
      "📈 Efficient Frontier — Shows optimal risk/return combinations for your portfolio.",
      "🧮 ROI Calculator — Enter a target ROI and see the monthly investment needed to achieve it.",
    ],
    page: "/dashboard",
  },
  {
    title: "AI Stock Chat",
    icon: MessageSquare,
    description: "Ask the AI anything about a specific stock.",
    details: [
      "💬 Chat Interface — On each stock detail page, ask questions like 'Should I buy this stock?' or 'What are the risks?'",
      "🧠 Context-Aware — The AI has full context of the stock's analysis, financials, and news.",
      "📊 Data-Backed — Responses reference the actual analysis data, not generic answers.",
      "🔄 Real-Time — Chat uses the latest analysis data, which refreshes every 30 seconds.",
    ],
    page: "/stock/:symbol",
  },
  {
    title: "Auto-Refresh & Real-Time Data",
    icon: RefreshCw,
    description: "Everything stays current without manual intervention.",
    details: [
      "⏱️ 30-Second Refresh — All charts, analyses, and portfolio data refresh every 30 seconds.",
      "🚀 Auto-Analyze on Login — When you sign in, all unanalyzed stocks begin analysis automatically.",
      "📊 Stale Detection — Stocks with analyses older than 5 minutes are re-analyzed automatically.",
      "🔄 Batch Processing — Stocks are analyzed in batches of 5 to maximize speed without overloading.",
      "📱 Progress Bar — A coverage bar at the top shows how many stocks have been analyzed.",
    ],
  },
];

const STORAGE_KEY = "stockpulse_onboarding_seen";

export function OnboardingGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const dismiss = () => {
    setIsOpen(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  if (!isOpen) {
    return (
      <div className="border-b border-border px-6 py-2 bg-card/50">
        <button
          onClick={() => { setIsOpen(true); setStep(0); }}
          className="text-xs text-primary hover:underline"
        >
          📖 Show Feature Guide
        </button>
      </div>
    );
  }

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="border-b border-border bg-gradient-to-r from-primary/5 via-card to-primary/5">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{current.title}</h3>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>
          </div>
          <button onClick={dismiss} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-5">
          {current.details.map((d, i) => (
            <p key={i} className="text-sm text-foreground/80 leading-relaxed pl-1">{d}</p>
          ))}
        </div>

        {/* Progress & Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{step + 1} / {STEPS.length}</span>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-3 w-3" /> Previous
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={dismiss}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Got it, let's go! 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
