import { useState, useMemo, useEffect } from "react";
import { Shield, Activity, Layers, BarChart3, ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, Legend,
} from "recharts";
import type { AnalysisResult } from "@/lib/stockData";
import { supabase } from "@/integrations/supabase/client";

interface Holding {
  symbol: string;
  company_name: string;
  quantity: number;
  avg_price: number;
  sector: string | null;
}

interface RiskAnalyticsProps {
  holdings: Holding[];
  analyses: Record<string, AnalysisResult>;
  livePrices?: Record<string, number>;
}

// Deterministic seeded random for Monte Carlo reproducibility
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function RiskAnalytics({ holdings, analyses, livePrices: externalPrices }: RiskAnalyticsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [fetchedPrices, setFetchedPrices] = useState<Record<string, number>>({});

  // Fetch live prices if not provided externally
  useEffect(() => {
    if (externalPrices && Object.keys(externalPrices).length > 0) return;
    if (holdings.length === 0) return;
    const fetchPrices = async () => {
      const prices: Record<string, number> = {};
      await Promise.all(
        holdings.map(async (h) => {
          try {
            const yahooSymbol = (h as any).exchange === "NSE" ? `${h.symbol}.NS` : h.symbol;
            const { data, error } = await supabase.functions.invoke("stock-data", {
              body: { symbol: yahooSymbol, range: "1d", interval: "1d" },
            });
            if (!error && data?.success && data.data?.regularMarketPrice) {
              prices[h.symbol] = data.data.regularMarketPrice;
            }
          } catch { /* skip */ }
        })
      );
      setFetchedPrices(prices);
    };
    fetchPrices();
  }, [holdings, externalPrices]);

  const livePrices = (externalPrices && Object.keys(externalPrices).length > 0) ? externalPrices : fetchedPrices;

  const formatCurrency = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Portfolio values
  const holdingsWithValue = useMemo(() =>
    holdings.map((h) => {
      const price = livePrices[h.symbol] || h.avg_price;
      return { ...h, livePrice: price, marketValue: h.quantity * price };
    }), [holdings, livePrices]);

  const totalValue = useMemo(() =>
    holdingsWithValue.reduce((s, h) => s + h.marketValue, 0), [holdingsWithValue]);

  // ===== 1. RISK FACTOR DECOMPOSITION =====
  const riskFactors = useMemo(() => {
    const sectorExposure: Record<string, number> = {};
    let bearishWeight = 0;
    let avgConfidence = 0;
    let _confidenceCount = 0;

    holdingsWithValue.forEach((h) => {
      const sector = h.sector || "Unknown";
      const weight = totalValue > 0 ? h.marketValue / totalValue : 0;
      sectorExposure[sector] = (sectorExposure[sector] || 0) + weight;

      const analysis = analyses[h.symbol];
      if (analysis?.sentiment === "bearish") bearishWeight += weight;
      if (analysis?.prediction?.confidenceScore) {
        avgConfidence += analysis.prediction.confidenceScore * weight;
        confidenceCount++;
      }
    });

    const topSectorWeight = Math.max(...Object.values(sectorExposure), 0);
    const sectorCount = Object.keys(sectorExposure).length;

    // Risk scores (0-100, higher = more risky)
    const marketRisk = Math.min(100, Math.round(bearishWeight * 100 + (1 - (avgConfidence / 100 || 0.5)) * 30));
    const concentrationRisk = Math.min(100, Math.round(topSectorWeight * 100));
    const diversificationRisk = Math.min(100, Math.round(Math.max(0, (1 - sectorCount / 8) * 100)));
    const sentimentRisk = Math.round(bearishWeight * 100);
    const volatilityRisk = Math.min(100, Math.round((1 - avgConfidence / 100) * 80 + bearishWeight * 20));

    return [
      { factor: "Market", risk: marketRisk, fullMark: 100 },
      { factor: "Concentration", risk: concentrationRisk, fullMark: 100 },
      { factor: "Diversification", risk: diversificationRisk, fullMark: 100 },
      { factor: "Sentiment", risk: sentimentRisk, fullMark: 100 },
      { factor: "Volatility", risk: volatilityRisk, fullMark: 100 },
    ];
  }, [holdingsWithValue, analyses, totalValue]);

  const overallRisk = useMemo(() =>
    Math.round(riskFactors.reduce((s, f) => s + f.risk, 0) / riskFactors.length), [riskFactors]);

  // ===== 2. MONTE CARLO SIMULATION =====
  const monteCarloData = useMemo(() => {
    const SIMS = 500;
    const MONTHS = 12;
    const rng = seededRandom(42);

    // Calculate portfolio expected return & volatility from AI data
    let expectedAnnualReturn = 0;
    let totalWeight = 0;
    holdingsWithValue.forEach((h) => {
      const analysis = analyses[h.symbol];
      const target1y = analysis?.prediction?.priceTarget1y;
      if (target1y && h.livePrice > 0) {
        const weight = h.marketValue / (totalValue || 1);
        expectedAnnualReturn += ((target1y / h.livePrice) - 1) * weight;
        totalWeight += weight;
      }
    });
    if (totalWeight < 0.5) expectedAnnualReturn = 0.08;

    const monthlyReturn = expectedAnnualReturn / 12;
    const monthlyVol = Math.abs(monthlyReturn) * 2 + 0.03; // Rough volatility estimate

    // Run simulations
    const paths: number[][] = [];
    for (let s = 0; s < SIMS; s++) {
      const path = [totalValue];
      let val = totalValue;
      for (let m = 1; m <= MONTHS; m++) {
        const shock = normalRandom(rng) * monthlyVol;
        val = val * (1 + monthlyReturn + shock);
        path.push(Math.max(0, val));
      }
      paths.push(path);
    }

    // Calculate percentiles at each month
    const percentileData = [];
    for (let m = 0; m <= MONTHS; m++) {
      const values = paths.map((p) => p[m]).sort((a, b) => a - b);
      percentileData.push({
        month: m === 0 ? "Now" : `M${m}`,
        p5: Math.round(values[Math.floor(SIMS * 0.05)]),
        p25: Math.round(values[Math.floor(SIMS * 0.25)]),
        p50: Math.round(values[Math.floor(SIMS * 0.5)]),
        p75: Math.round(values[Math.floor(SIMS * 0.75)]),
        p95: Math.round(values[Math.floor(SIMS * 0.95)]),
      });
    }

    // VaR & max drawdown
    const finalValues = paths.map((p) => p[MONTHS]);
    const sortedFinals = [...finalValues].sort((a, b) => a - b);
    const var95 = totalValue - sortedFinals[Math.floor(SIMS * 0.05)];
    const cvar95 = totalValue - sortedFinals.slice(0, Math.floor(SIMS * 0.05)).reduce((s, v) => s + v, 0) / Math.floor(SIMS * 0.05);

    // Sharpe ratio approximation
    const avgReturn = finalValues.reduce((s, v) => s + (v / totalValue - 1), 0) / SIMS;
    const stdDev = Math.sqrt(finalValues.reduce((s, v) => s + Math.pow(v / totalValue - 1 - avgReturn, 2), 0) / SIMS);
    const sharpe = stdDev > 0 ? (avgReturn - 0.04) / stdDev : 0; // 4% risk-free rate

    // Probability of loss
    const probLoss = finalValues.filter((v) => v < totalValue).length / SIMS * 100;

    return { percentileData, var95, cvar95, sharpe, probLoss, expectedAnnualReturn };
  }, [holdingsWithValue, analyses, totalValue]);

  // ===== 3. CORRELATION & CONCENTRATION =====
  const concentrationData = useMemo(() => {
    const sectorMap: Record<string, { value: number; holdings: string[] }> = {};
    holdingsWithValue.forEach((h) => {
      const sector = h.sector || "Unknown";
      if (!sectorMap[sector]) sectorMap[sector] = { value: 0, holdings: [] };
      sectorMap[sector].value += h.marketValue;
      sectorMap[sector].holdings.push(h.symbol);
    });

    const sectorData = Object.entries(sectorMap)
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        pct: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        count: data.holdings.length,
        holdings: data.holdings,
      }))
      .sort((a, b) => b.value - a.value);

    // HHI (Herfindahl-Hirschman Index) for concentration
    const hhi = sectorData.reduce((s, d) => s + Math.pow(d.pct, 2), 0);
    const maxHhi = 10000; // 100^2
    const concentrationLevel = hhi > 4000 ? "High" : hhi > 2000 ? "Moderate" : "Low";

    // Top holding concentration
    const topHoldings = holdingsWithValue
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .map((h) => ({
        symbol: h.symbol,
        pct: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0,
        value: h.marketValue,
      }));

    const top3Pct = topHoldings.slice(0, 3).reduce((s, h) => s + h.pct, 0);

    return { sectorData, hhi, concentrationLevel, topHoldings, top3Pct };
  }, [holdingsWithValue, totalValue]);

  const sectorColors = [
    "hsl(var(--primary))", "hsl(var(--gain))", "hsl(var(--warning))",
    "hsl(var(--loss))", "hsl(210, 70%, 55%)", "hsl(280, 60%, 55%)",
    "hsl(160, 60%, 45%)", "hsl(30, 80%, 55%)",
  ];

  const riskColor = (score: number) =>
    score >= 70 ? "text-loss" : score >= 40 ? "text-warning" : "text-gain";

  return (
    <div className="space-y-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4"
      >
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Risk Analytics
          <span className={`ml-2 rounded px-2 py-0.5 text-[10px] font-bold ${
            overallRisk >= 70 ? "bg-loss/15 text-loss" :
            overallRisk >= 40 ? "bg-warning/15 text-warning" : "bg-gain/15 text-gain"
          }`}>
            Risk Score: {overallRisk}/100
          </span>
        </h3>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-6">
          {/* Simple View: Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Loss Probability</p>
              <p className={`text-2xl font-bold ${monteCarloData.probLoss > 40 ? "text-loss" : monteCarloData.probLoss > 20 ? "text-warning" : "text-gain"}`}>
                {monteCarloData.probLoss.toFixed(0)}%
              </p>
              <p className="text-[10px] text-muted-foreground">chance of loss in 1Y</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Value at Risk (95%)</p>
              <p className="text-2xl font-bold text-loss">{formatCurrency(monteCarloData.var95)}</p>
              <p className="text-[10px] text-muted-foreground">max 1Y loss (95% conf)</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Concentration</p>
              <p className={`text-2xl font-bold ${concentrationData.concentrationLevel === "High" ? "text-loss" : concentrationData.concentrationLevel === "Moderate" ? "text-warning" : "text-gain"}`}>
                {concentrationData.concentrationLevel}
              </p>
              <p className="text-[10px] text-muted-foreground">Top 3 = {concentrationData.top3Pct.toFixed(0)}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Sharpe Ratio</p>
              <p className={`text-2xl font-bold ${monteCarloData.sharpe >= 1 ? "text-gain" : monteCarloData.sharpe >= 0.5 ? "text-warning" : "text-loss"}`}>
                {monteCarloData.sharpe.toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">risk-adjusted return</p>
            </div>
          </div>

          {/* Risk Factor Radar */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> Risk Factor Decomposition
              </h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={riskFactors}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="factor" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                    <Radar name="Risk" dataKey="risk" stroke="hsl(var(--loss))" fill="hsl(var(--loss))" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {showDetails && (
                <div className="mt-3 space-y-1.5">
                  {riskFactors.map((f) => (
                    <div key={f.factor} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{f.factor}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${f.risk >= 70 ? "bg-loss" : f.risk >= 40 ? "bg-warning" : "bg-gain"}`}
                            style={{ width: `${f.risk}%` }}
                          />
                        </div>
                        <span className={`font-bold ${riskColor(f.risk)}`}>{f.risk}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sector Concentration */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Layers className="h-3 w-3" /> Sector Concentration
              </h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={concentrationData.sectorData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <YAxis type="category" dataKey="sector" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={80} />
                    <RTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, "Allocation"]}
                    />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {concentrationData.sectorData.map((_, i) => (
                        <Cell key={i} fill={sectorColors[i % sectorColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {showDetails && (
                <div className="mt-3 space-y-1">
                  {concentrationData.topHoldings.map((h) => (
                    <div key={h.symbol} className="flex items-center justify-between text-xs">
                      <span className="font-bold text-primary">{h.symbol}</span>
                      <span className="text-muted-foreground">{h.pct.toFixed(1)}% ({formatCurrency(h.value)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Monte Carlo Simulation Chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> Monte Carlo Simulation (500 scenarios, 12 months)
            </h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monteCarloData.percentileData}>
                  <defs>
                    <linearGradient id="mcGradOuter" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mcGradInner" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <RTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Area type="monotone" dataKey="p5" name="5th %ile (worst)" stroke="hsl(var(--loss))" fill="none" strokeWidth={1} strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="p25" name="25th %ile" stroke="hsl(var(--warning))" fill="url(#mcGradOuter)" strokeWidth={1} />
                  <Area type="monotone" dataKey="p50" name="Median" stroke="hsl(var(--primary))" fill="url(#mcGradInner)" strokeWidth={2} />
                  <Area type="monotone" dataKey="p75" name="75th %ile" stroke="hsl(var(--gain))" fill="none" strokeWidth={1} />
                  <Area type="monotone" dataKey="p95" name="95th %ile (best)" stroke="hsl(var(--gain))" fill="none" strokeWidth={1} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Metrics Toggle */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Info className="h-3 w-3" />
              {showDetails ? "Hide Detailed Metrics" : "Show Detailed Metrics"}
            </button>
          </div>

          {/* Detailed Quant Metrics */}
          {showDetails && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Expected Annual Return</p>
                <p className={`text-lg font-bold ${monteCarloData.expectedAnnualReturn >= 0 ? "text-gain" : "text-loss"}`}>
                  {(monteCarloData.expectedAnnualReturn * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground">AI-weighted portfolio return</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Conditional VaR (95%)</p>
                <p className="text-lg font-bold text-loss">{formatCurrency(monteCarloData.cvar95)}</p>
                <p className="text-[10px] text-muted-foreground">avg loss in worst 5% scenarios</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">HHI Index</p>
                <p className={`text-lg font-bold ${concentrationData.hhi > 4000 ? "text-loss" : concentrationData.hhi > 2000 ? "text-warning" : "text-gain"}`}>
                  {concentrationData.hhi.toFixed(0)}
                </p>
                <p className="text-[10px] text-muted-foreground">&lt;2000 = diversified, &gt;4000 = concentrated</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
