import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, RefreshCw, ExternalLink, Globe, FileText, Newspaper, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus, Target, Users, Loader2, BarChart3 } from "lucide-react";
import { getSentimentColor, getScoreColor } from "@/lib/stockData";
import type { AnalysisResult, Company } from "@/lib/stockData";
import { getCachedAnalysis, analyzeCompany } from "@/lib/api/stockAnalysis";
import { RealTimeChart } from "@/components/charts/RealTimeChart";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { StockChat } from "@/components/dashboard/StockChat";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function PortfolioHoldingDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [holding, setHolding] = useState<{
    symbol: string;
    company_name: string;
    quantity: number;
    avg_price: number;
    sector: string | null;
    exchange: string | null;
    currency: string;
  } | null>(null);

  // Load holding data from user_portfolios
  useEffect(() => {
    if (!symbol || !user) return;
    supabase
      .from("user_portfolios")
      .select("*")
      .eq("user_id", user.id)
      .eq("symbol", symbol)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setHolding(data);
      });
  }, [symbol, user]);

  // Load cached analysis
  useEffect(() => {
    if (!symbol) return;
    getCachedAnalysis(symbol).then((cached) => {
      if (cached) setAnalysis(cached);
      setIsLoading(false);
    });
  }, [symbol]);

  const companyForAnalysis: Company | null = holding
    ? {
        symbol: holding.symbol,
        name: holding.company_name,
        sector: holding.sector || "Unknown",
        website: "",
        etf: (holding.exchange === "NSE" ? "nifty50" : "spy") as any,
        tradingViewSymbol: holding.symbol,
      }
    : null;

  const runAnalysis = useCallback(async () => {
    if (!companyForAnalysis) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeCompany(companyForAnalysis);
      setAnalysis(result);
      toast({ title: "Analysis complete", description: `Score: ${result.overallScore}/100` });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }, [companyForAnalysis, toast]);

  // Fetch live price
  useEffect(() => {
    if (!symbol || !holding) return;
    const yahooSym = holding.exchange === "NSE" ? `${symbol}.NS` : symbol;
    const fetchPrice = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stock-data", {
          body: { symbol: yahooSym, range: "1d", interval: "1d" },
        });
        if (!error && data?.success) {
          if (data.data?.regularMarketPrice) setLivePrice(data.data.regularMarketPrice);
          if (data.data?.previousClose) setPrevClose(data.data.previousClose);
        }
      } catch { /* ignore */ }
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 1000);
    return () => clearInterval(iv);
  }, [symbol, holding]);

  if (!symbol) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-foreground">Holding not found</p>
      </div>
    );
  }

  const yahooSymbol = holding?.exchange === "NSE" ? `${symbol}.NS` : symbol;
  const displayName = holding?.company_name || symbol;
  const costBasis = holding ? holding.quantity * holding.avg_price : 0;
  const marketValue = holding && livePrice ? holding.quantity * livePrice : null;
  const unrealizedPnL = marketValue !== null ? marketValue - costBasis : null;
  const pnlPercent = unrealizedPnL !== null && costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : null;
  const dayChange = livePrice && prevClose ? livePrice - prevClose : null;
  const dayChangePct = dayChange && prevClose ? (dayChange / prevClose) * 100 : null;
  const target1y = analysis?.prediction?.priceTarget1y;
  const upside1y = livePrice && target1y ? ((target1y - livePrice) / livePrice) * 100 : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{symbol}</h1>
                {holding?.sector && (
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{holding.sector}</span>
                )}
                {holding?.exchange && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{holding.exchange}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {holding && (
              <div className="text-right text-xs text-muted-foreground">
                <p>{holding.quantity} shares · Avg ${holding.avg_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                <p className="font-medium text-foreground">
                  {livePrice ? `$${(holding.quantity * livePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${costBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            )}
            {analysis && <ScoreBadge score={analysis.overallScore} size="lg" />}
            <button
              onClick={runAnalysis}
              disabled={isAnalyzing || !holding}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isAnalyzing ? "Analyzing..." : analysis ? "Refresh Analysis" : "Run Analysis"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 space-y-6">
        {/* Real-time Chart */}
        <RealTimeChart
          symbol={symbol}
          yahooSymbol={yahooSymbol}
          height={500}
          refreshInterval={30000}
        />

        {/* P&L Detail Card */}
        {holding && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Live Price</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {livePrice ? `$${livePrice.toFixed(2)}` : "—"}
              </p>
              {dayChangePct !== null && (
                <p className={`text-xs font-medium ${dayChangePct >= 0 ? "text-gain" : "text-loss"}`}>
                  {dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}% today
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Cost</p>
              <p className="mt-1 text-lg font-bold text-foreground">${holding.avg_price.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{holding.quantity} shares</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost Basis</p>
              <p className="mt-1 text-lg font-bold text-foreground">${costBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Market Value</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {marketValue !== null ? `$${marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${unrealizedPnL !== null && unrealizedPnL >= 0 ? "border-gain/20 bg-gain/5" : unrealizedPnL !== null ? "border-loss/20 bg-loss/5" : "border-border bg-card"}`}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unrealized P&L</p>
              {unrealizedPnL !== null && pnlPercent !== null ? (
                <>
                  <p className={`mt-1 text-lg font-bold ${unrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}>
                    {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className={`text-xs font-medium ${pnlPercent >= 0 ? "text-gain" : "text-loss"}`}>
                    {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}%
                  </p>
                </>
              ) : <p className="mt-1 text-lg font-bold text-muted-foreground">—</p>}
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">1Y Target Upside</p>
              {upside1y !== null && target1y ? (
                <>
                  <p className={`mt-1 text-lg font-bold ${upside1y >= 0 ? "text-gain" : "text-loss"}`}>
                    {upside1y >= 0 ? "+" : ""}{upside1y.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Target: ${target1y.toFixed(2)}</p>
                </>
              ) : <p className="mt-1 text-lg font-bold text-muted-foreground">—</p>}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !analysis ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-lg text-foreground">No analysis yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Click "Run Analysis" to get a full micro + macro analysis with predictions for {displayName}</p>
          </div>
        ) : (
          <>
            {/* Sentiment Banner */}
            <div className={`rounded-xl p-5 ${
              analysis.sentiment === "bullish" ? "border border-gain/20 bg-gain/5" :
              analysis.sentiment === "bearish" ? "border border-loss/20 bg-loss/5" :
              "border border-warning/20 bg-warning/5"
            }`}>
              <div className="flex items-center gap-3">
                {analysis.sentiment === "bullish" ? <TrendingUp className="h-6 w-6 text-gain" /> :
                 analysis.sentiment === "bearish" ? <TrendingDown className="h-6 w-6 text-loss" /> :
                 <Minus className="h-6 w-6 text-warning" />}
                <div>
                  <span className={`text-lg font-bold capitalize ${getSentimentColor(analysis.sentiment)}`}>{analysis.sentiment}</span>
                  <span className="ml-3 text-sm text-muted-foreground">Score: <span className={`font-bold ${getScoreColor(analysis.overallScore)}`}>{analysis.overallScore}/100</span></span>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">Updated: {new Date(analysis.lastUpdated).toLocaleString()}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{analysis.summary}</p>
            </div>

            {/* Prediction Section */}
            {analysis.prediction?.recommendation && (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">AI Prediction</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-3 py-1.5 text-sm font-bold uppercase ${
                      analysis.prediction.recommendation === "buy" ? "bg-gain/15 text-gain border border-gain/20" :
                      analysis.prediction.recommendation === "sell" ? "bg-loss/15 text-loss border border-loss/20" :
                      "bg-warning/15 text-warning border border-warning/20"
                    }`}>
                      {analysis.prediction.recommendation}
                    </span>
                    {analysis.prediction.confidenceScore && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Confidence</p>
                        <p className={`text-sm font-bold ${
                          analysis.prediction.confidenceScore >= 70 ? "text-gain" :
                          analysis.prediction.confidenceScore >= 40 ? "text-warning" : "text-loss"
                        }`}>{analysis.prediction.confidenceScore}%</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price Targets Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "1 Week", value: analysis.prediction.priceTarget1w },
                    { label: "1 Month", value: analysis.prediction.priceTarget1m },
                    { label: "3 Months", value: analysis.prediction.priceTarget3m },
                    { label: "1 Year", value: analysis.prediction.priceTarget1y },
                  ].map((target) => (
                    <div key={target.label} className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">{target.label}</p>
                      <p className="mt-1 text-lg font-bold text-foreground">
                        {target.value ? target.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                      </p>
                    </div>
                  ))}
                </div>

                {analysis.prediction.predictionReasoning && (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {analysis.prediction.predictionReasoning}
                  </p>
                )}

                {analysis.stockSplitCaveat && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                    <p className="text-xs leading-relaxed text-warning">
                      <span className="font-semibold">Stock Split Notice:</span> {analysis.stockSplitCaveat}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Micro Analysis Grid */}
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">📊 Micro — Company Fundamentals</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AnalysisSection icon={<Globe className="h-5 w-5 text-primary" />} title="Website & Digital Insights" content={analysis.websiteInsights} />
              <AnalysisSection icon={<FileText className="h-5 w-5 text-gain" />} title="Financial Highlights" content={analysis.financialHighlights} />
              <AnalysisSection icon={<Newspaper className="h-5 w-5 text-warning" />} title="News Digest" content={analysis.newsDigest} />
              <AnalysisSection icon={<Target className="h-5 w-5 text-primary" />} title="Competitive Position" content={analysis.competitivePosition} />
            </div>

            {/* Detailed Analysis */}
            {analysis.detailedAnalysis && (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Deep-Dive Analysis</h2>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{analysis.detailedAnalysis}</p>
              </div>
            )}

            {/* Management Outlook */}
            {analysis.managementOutlook && (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-accent" />
                  <h2 className="text-lg font-semibold text-foreground">Management & Outlook</h2>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{analysis.managementOutlook}</p>
              </div>
            )}

            {/* Macro Analysis Section */}
            {analysis.macro && (
              <>
                <h2 className="mt-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">🌍 Macro — External Forces & Risk Intelligence</h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <MacroSection emoji="⚔️" title="Geopolitical & Trade Risk" content={analysis.macro.geopoliticalAnalysis} borderColor="border-loss/20" bgColor="bg-loss/5" />
                  <MacroSection emoji="🔍" title="Controversy & Scandal Scanner" content={analysis.macro.controversyScanner} borderColor="border-warning/20" bgColor="bg-warning/5" />
                  <MacroSection emoji="📈" title="Macro-Economic Factors" content={analysis.macro.macroEconomicFactors} borderColor="border-primary/20" bgColor="bg-primary/5" />
                  <MacroSection emoji="🏭" title="Sector Tailwinds & Headwinds" content={analysis.macro.sectorTailwindsHeadwinds} borderColor="border-gain/20" bgColor="bg-gain/5" />
                  <MacroSection emoji="🗳️" title="Regional Sentiment & Flows" content={analysis.macro.regionalSentiment} borderColor="border-primary/20" bgColor="bg-primary/5" />
                  <MacroSection emoji="📰" title="Media Manipulation Check" content={analysis.macro.mediaManipulationCheck} borderColor="border-warning/20" bgColor="bg-warning/5" />
                </div>
              </>
            )}

            {/* Strengths & Risks */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-gain/20 bg-gain/5 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-gain" />
                  <h2 className="text-lg font-semibold text-gain">Key Strengths</h2>
                </div>
                <ul className="space-y-3">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gain" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-loss/20 bg-loss/5 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-loss" />
                  <h2 className="text-lg font-semibold text-loss">Key Risks</h2>
                </div>
                <ul className="space-y-3">
                  {analysis.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-loss" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Citations */}
            {analysis.citations.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-lg font-semibold text-foreground">Sources & Citations ({analysis.citations.length})</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {analysis.citations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs transition-colors hover:border-primary/30 hover:bg-secondary/60"
                    >
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{c.title}</p>
                        <p className="text-muted-foreground">{c.source}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-[10px] text-muted-foreground/50">
              AI-generated analysis from publicly available data. Not financial advice.
            </p>
          </>
        )}
      </main>

      <StockChat
        symbol={symbol}
        companyName={displayName}
        analysis={analysis}
        livePrice={livePrice}
        avgCost={holding?.avg_price}
        quantity={holding?.quantity}
        sector={holding?.sector || undefined}
      />
    </div>
  );
}

function AnalysisSection({ icon, title, content }: { icon: React.ReactNode; title: string; content: string }) {
  if (!content) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{content}</p>
    </div>
  );
}

function MacroSection({ emoji, title, content, borderColor, bgColor }: { emoji: string; title: string; content: string; borderColor: string; bgColor: string }) {
  if (!content) return null;
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-5`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{content}</p>
    </div>
  );
}
