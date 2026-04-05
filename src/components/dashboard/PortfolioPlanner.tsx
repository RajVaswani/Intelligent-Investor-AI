import { useState, useMemo, useEffect } from "react";
import { Target, TrendingUp, AlertTriangle, DollarSign, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend, ReferenceLine } from "recharts";
import type { AnalysisResult } from "@/lib/stockData";
import { supabase } from "@/integrations/supabase/client";

interface PortfolioHolding {
  id: string;
  symbol: string;
  company_name: string;
  quantity: number;
  avg_price: number;
  sector: string | null;
  exchange: string | null;
  currency: string;
}

interface PortfolioPlannerProps {
  holdings: PortfolioHolding[];
  analyses: Record<string, AnalysisResult>;
  totalValue: number;
}

interface ProjectionPoint {
  month: string;
  optimistic: number;
  base: number;
  pessimistic: number;
  invested: number;
}

export function PortfolioPlanner({ holdings, analyses }: PortfolioPlannerProps) {
  const [monthlyInvestment, setMonthlyInvestment] = useState("");
  const [targetROI, setTargetROI] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("12");
  const [showPlanner, setShowPlanner] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [_pricesLoading, setPricesLoading] = useState(false);

  // Fetch live prices for all holdings
  useEffect(() => {
    if (holdings.length === 0) return;
    setPricesLoading(true);
    const fetchPrices = async () => {
      const prices: Record<string, number> = {};
      await Promise.all(
        holdings.map(async (h) => {
          try {
            const yahooSymbol = h.exchange === "NSE" ? `${h.symbol}.NS` : h.symbol;
            const { data, error } = await supabase.functions.invoke("stock-data", {
              body: { symbol: yahooSymbol, range: "1d", interval: "1d" },
            });
            if (!error && data?.success && data.data?.regularMarketPrice) {
              prices[h.symbol] = data.data.regularMarketPrice;
            }
          } catch {
            // skip failed fetches
          }
        })
      );
      setLivePrices(prices);
      setPricesLoading(false);
    };
    fetchPrices();
  }, [holdings]);

  // Calculate P&L per holding using live market prices
  const holdingsPnL = useMemo(() => {
    return holdings.map((h) => {
      const analysis = analyses[h.symbol];
      const costBasis = h.quantity * h.avg_price;
      const target1y = analysis?.prediction?.priceTarget1y;
      const livePrice = livePrices[h.symbol];
      const hasLivePrice = !!livePrice;
      const currentPrice = livePrice || h.avg_price;
      const marketValue = h.quantity * currentPrice;
      const unrealizedPnL = hasLivePrice ? marketValue - costBasis : 0;
      const pnlPercent = hasLivePrice && costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
      const projectedValue1y = target1y ? h.quantity * target1y : null;
      const projectedPnL1y = projectedValue1y ? projectedValue1y - costBasis : null;

      return {
        ...h,
        costBasis,
        hasLivePrice,
        currentPrice,
        marketValue,
        unrealizedPnL,
        pnlPercent,
        projectedValue1y,
        projectedPnL1y,
        recommendation: analysis?.prediction?.recommendation || null,
        confidence: analysis?.prediction?.confidenceScore || null,
        sentiment: analysis?.sentiment || null,
        topRisk: analysis?.risks?.[0] || null,
      };
    }).sort((a, b) => b.marketValue - a.marketValue);
  }, [holdings, analyses, livePrices]);

  // Portfolio-level P&L
  const portfolioPnL = useMemo(() => {
    const totalCost = holdingsPnL.reduce((s, h) => s + h.costBasis, 0);
    const totalEstimated = holdingsPnL.reduce((s, h) => s + h.estimatedValue, 0);
    const totalUnrealized = totalEstimated - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0;
    const projected1y = holdingsPnL.reduce((s, h) => s + (h.projectedValue1y || h.estimatedValue), 0);
    return { totalCost, totalEstimated, totalUnrealized, totalPnlPct, projected1y };
  }, [holdingsPnL]);

  // Generate projection chart data
  const projectionData = useMemo((): ProjectionPoint[] => {
    const months = parseInt(timeHorizon) || 12;
    const monthly = parseFloat(monthlyInvestment) || 0;

    // Calculate weighted avg growth rate from AI predictions
    const analyzedHoldings = holdingsPnL.filter((h) => h.projectedValue1y !== null);
    let avgAnnualGrowth = 0.08; // default 8%
    if (analyzedHoldings.length > 0) {
      const totalWeight = analyzedHoldings.reduce((s, h) => s + h.estimatedValue, 0);
      avgAnnualGrowth = analyzedHoldings.reduce((s, h) => {
        const growth = h.projectedValue1y! / h.estimatedValue - 1;
        const weight = h.estimatedValue / totalWeight;
        return s + growth * weight;
      }, 0);
    }

    const monthlyGrowthBase = Math.pow(1 + avgAnnualGrowth, 1 / 12) - 1;
    const monthlyGrowthOpt = monthlyGrowthBase * 1.5;
    const monthlyGrowthPess = monthlyGrowthBase * 0.3;

    const data: ProjectionPoint[] = [];
    let base = portfolioPnL.totalEstimated;
    let opt = portfolioPnL.totalEstimated;
    let pess = portfolioPnL.totalEstimated;
    let invested = portfolioPnL.totalCost;

    data.push({ month: "Now", optimistic: opt, base, pessimistic: pess, invested });

    for (let i = 1; i <= months; i++) {
      invested += monthly;
      base = (base + monthly) * (1 + monthlyGrowthBase);
      opt = (opt + monthly) * (1 + monthlyGrowthOpt);
      pess = (pess + monthly) * (1 + monthlyGrowthPess);

      const monthLabel = i <= 12 ? `M${i}` : `Y${(i / 12).toFixed(1)}`;
      data.push({
        month: monthLabel,
        optimistic: Math.round(opt),
        base: Math.round(base),
        pessimistic: Math.round(pess),
        invested: Math.round(invested),
      });
    }
    return data;
  }, [timeHorizon, monthlyInvestment, holdingsPnL, portfolioPnL]);

  // ROI goal analysis
  const goalAnalysis = useMemo(() => {
    const targetPct = parseFloat(targetROI) || 0;
    const months = parseInt(timeHorizon) || 12;
    const targetValue = portfolioPnL.totalEstimated * (1 + targetPct / 100);
    const projectedEnd = projectionData[projectionData.length - 1];
    const onTrack = projectedEnd ? projectedEnd.base >= targetValue : false;
    const gap = projectedEnd ? targetValue - projectedEnd.base : 0;

    // Threats from holdings
    const threats = holdingsPnL
      .filter((h) => h.sentiment === "bearish" || h.recommendation === "sell")
      .map((h) => ({
        symbol: h.symbol,
        reason: h.recommendation === "sell" ? "AI recommends selling" : "Bearish sentiment",
        risk: h.topRisk,
        impact: h.estimatedValue,
      }));

    return { targetValue, onTrack, gap, threats };
  }, [targetROI, timeHorizon, portfolioPnL, projectionData, holdingsPnL]);

  const formatCurrency = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* P&L Summary Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Cost Basis</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(portfolioPnL.totalCost)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Estimated Value</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(portfolioPnL.totalEstimated)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${portfolioPnL.totalUnrealized >= 0 ? "border-gain/20 bg-gain/5" : "border-loss/20 bg-loss/5"}`}>
          <p className="text-xs text-muted-foreground">Unrealized P&L</p>
          <p className={`text-xl font-bold ${portfolioPnL.totalUnrealized >= 0 ? "text-gain" : "text-loss"}`}>
            {portfolioPnL.totalUnrealized >= 0 ? "+" : ""}{formatCurrency(portfolioPnL.totalUnrealized)}
          </p>
          <p className={`text-xs ${portfolioPnL.totalPnlPct >= 0 ? "text-gain" : "text-loss"}`}>
            {portfolioPnL.totalPnlPct >= 0 ? "+" : ""}{portfolioPnL.totalPnlPct.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">1Y AI Projection</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(portfolioPnL.projected1y)}</p>
        </div>
      </div>

      {/* Per-Holding P&L Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Holdings P&L Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Symbol</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Avg Cost</th>
                <th className="px-4 py-2 text-right font-medium">AI Est. Price</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2 text-right font-medium">P&L</th>
                <th className="px-4 py-2 text-right font-medium">P&L %</th>
                <th className="px-4 py-2 text-center font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {holdingsPnL.map((h) => (
                <tr key={h.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-primary">{h.symbol}</span>
                    <p className="text-muted-foreground/70 truncate max-w-[120px]">{h.company_name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground">{h.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">${h.avg_price.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{h.hasEstimate ? `$${h.currentEstimate.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">{h.hasEstimate ? formatCurrency(h.estimatedValue) : "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${!h.hasEstimate ? "text-muted-foreground" : h.unrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}>
                    {h.hasEstimate ? `${h.unrealizedPnL >= 0 ? "+" : ""}${formatCurrency(h.unrealizedPnL)}` : "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-medium ${!h.hasEstimate ? "text-muted-foreground" : h.pnlPercent >= 0 ? "text-gain" : "text-loss"}`}>
                    {h.hasEstimate ? `${h.pnlPercent >= 0 ? "+" : ""}${h.pnlPercent.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {h.recommendation && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        h.recommendation === "buy" ? "bg-gain/15 text-gain" :
                        h.recommendation === "sell" ? "bg-loss/15 text-loss" :
                        "bg-warning/15 text-warning"
                      }`}>{h.recommendation}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Goal Planner */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <button
          onClick={() => setShowPlanner(!showPlanner)}
          className="flex w-full items-center justify-between"
        >
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Strategic Goal Planner
          </h3>
          {showPlanner ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showPlanner && (
          <>
            {/* Inputs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Monthly Investment ($)</label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={monthlyInvestment}
                    onChange={(e) => setMonthlyInvestment(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Target ROI (%)</label>
                <div className="relative mt-1">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="e.g. 25"
                    value={targetROI}
                    onChange={(e) => setTargetROI(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Time Horizon (months)</label>
                <select
                  value={timeHorizon}
                  onChange={(e) => setTimeHorizon(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="6">6 months</option>
                  <option value="12">1 year</option>
                  <option value="24">2 years</option>
                  <option value="36">3 years</option>
                  <option value="60">5 years</option>
                </select>
              </div>
            </div>

            {/* Goal Status */}
            {targetROI && (
              <div className={`rounded-lg p-4 ${goalAnalysis.onTrack ? "border border-gain/20 bg-gain/5" : "border border-warning/20 bg-warning/5"}`}>
                <div className="flex items-center gap-2">
                  {goalAnalysis.onTrack ? (
                    <TrendingUp className="h-5 w-5 text-gain" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  )}
                  <span className={`text-sm font-bold ${goalAnalysis.onTrack ? "text-gain" : "text-warning"}`}>
                    {goalAnalysis.onTrack ? "On Track to Hit Your Goal!" : "Goal Requires Adjustment"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target: {formatCurrency(goalAnalysis.targetValue)} ({targetROI}% ROI) in {timeHorizon} months
                  {!goalAnalysis.onTrack && goalAnalysis.gap > 0 && (
                    <span className="text-warning"> — Gap: {formatCurrency(goalAnalysis.gap)}</span>
                  )}
                </p>
              </div>
            )}

            {/* Projection Chart */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Portfolio Projection</h4>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData}>
                    <defs>
                      <linearGradient id="gradOpt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--gain))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--gain))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradPess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      formatter={(value: number) => [formatCurrency(value)]}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    {targetROI && (
                      <ReferenceLine
                        y={goalAnalysis.targetValue}
                        stroke="hsl(var(--warning))"
                        strokeDasharray="5 5"
                        label={{ value: "Target", fill: "hsl(var(--warning))", fontSize: 10 }}
                      />
                    )}
                    <Area type="monotone" dataKey="invested" name="Invested" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="none" strokeWidth={1} />
                    <Area type="monotone" dataKey="pessimistic" name="Bearish" stroke="hsl(var(--loss))" fill="url(#gradPess)" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="base" name="Base Case" stroke="hsl(var(--primary))" fill="url(#gradBase)" strokeWidth={2} />
                    <Area type="monotone" dataKey="optimistic" name="Bullish" stroke="hsl(var(--gain))" fill="url(#gradOpt)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Threat Analysis */}
            {goalAnalysis.threats.length > 0 && (
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-loss" /> Potential Threats to Your Portfolio
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {goalAnalysis.threats.map((t) => (
                    <div key={t.symbol} className="rounded-lg border border-loss/20 bg-loss/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-loss">{t.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">Exposure: {formatCurrency(t.impact)}</span>
                      </div>
                      <p className="mt-1 text-[10px] font-medium text-foreground">{t.reason}</p>
                      {t.risk && <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{t.risk}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
