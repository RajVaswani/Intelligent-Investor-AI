import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import {
  Activity, TrendingUp, Shield, BarChart3, Brain, Globe,
  Zap, CheckCircle, ArrowRight, Clock
} from "lucide-react";

const BETA_END = new Date("2026-07-04T00:00:00Z"); // ~90 days from now

function BetaCountdown() {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft());

  function getTimeLeft() {
    const diff = BETA_END.getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const blocks = [
    { label: "Days", value: timeLeft.days },
    { label: "Hours", value: timeLeft.hours },
    { label: "Minutes", value: timeLeft.minutes },
    { label: "Seconds", value: timeLeft.seconds },
  ];

  return (
    <div className="flex items-center gap-3">
      {blocks.map((b) => (
        <div key={b.label} className="flex flex-col items-center">
          <span className="text-2xl font-bold text-primary tabular-nums">
            {String(b.value).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: Brain, title: "AI-Powered Analysis", desc: "Deep macro & micro analysis on every stock using advanced AI models." },
  { icon: TrendingUp, title: "Price Predictions", desc: "1-week to 1-year price targets with confidence scoring." },
  { icon: BarChart3, title: "Monte Carlo Simulation", desc: "Run stress tests on your portfolio with thousands of simulated scenarios." },
  { icon: Shield, title: "Risk Analytics", desc: "VaR, Sharpe ratio, and sector concentration analysis at a glance." },
  { icon: Globe, title: "Geopolitical Insights", desc: "Geopolitical and regional sentiment analysis for every holding." },
  { icon: Zap, title: "IBKR Auto-Sync", desc: "Connect your Interactive Brokers account for automatic portfolio sync." },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate("/market", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-bold">StockPulse AI</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/auth")}
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <Clock className="h-4 w-4" />
            Free Beta Access — Limited Time
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            AI-Powered Stock Analysis
            <br />
            <span className="text-primary">for Smarter Investing</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Get real-time AI analysis, Monte Carlo simulations, risk analytics, and price predictions
            for Nifty 50 and S&P 500 stocks — all in one dashboard.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Free Beta <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="flex items-center gap-2 rounded-lg border border-border px-8 py-3 text-base text-foreground hover:bg-secondary transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold">Everything You Need</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Professional-grade tools powered by AI, built for retail investors.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-3xl font-bold">Simple Pricing</h2>
          <p className="mt-3 text-muted-foreground">
            One plan, full access. Free during beta.
          </p>

          <div className="mt-10 rounded-2xl border-2 border-primary bg-card p-8">
            <div className="mb-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase text-primary">
              Beta — Free
            </div>
            <div className="mt-4 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-extrabold text-foreground line-through opacity-40">$10</span>
              <span className="text-5xl font-extrabold text-primary ml-3">$0</span>
              <span className="text-muted-foreground">/mo</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              $10/mo after beta ends
            </p>

            <div className="my-6 border-t border-border" />

            <div className="mb-6 flex flex-col items-center gap-1">
              <span className="text-xs uppercase text-muted-foreground">Beta ends in</span>
              <BetaCountdown />
            </div>

            <ul className="space-y-3 text-left text-sm">
              {[
                "Unlimited AI stock analyses",
                "Monte Carlo stress testing",
                "Portfolio risk analytics",
                "Price predictions with confidence",
                "IBKR auto-sync",
                "Geopolitical & macro insights",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="mt-8 w-full rounded-lg bg-primary py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} StockPulse AI. All rights reserved.</span>
          <span>AI-generated analysis. Not financial advice.</span>
        </div>
      </footer>
    </div>
  );
}
