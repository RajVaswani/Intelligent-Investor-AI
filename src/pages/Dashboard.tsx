import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { analyzeCompany as analyzeCompanyAPI } from "@/lib/api/stockAnalysis";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import type { AnalysisResult, Company } from "@/lib/stockData";
import { getSentimentColor } from "@/lib/stockData";
import {
  Activity, LogOut, Plus, Trash2, RefreshCw, Loader2, Settings,
  TrendingUp, TrendingDown, Minus, Link2, PieChart, BarChart3, Briefcase
} from "lucide-react";

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

function SentimentIcon({ sentiment }: { sentiment: string }) {
  const cls = `h-4 w-4 ${getSentimentColor(sentiment as any)}`;
  if (sentiment === "bullish") return <TrendingUp className={cls} />;
  if (sentiment === "bearish") return <TrendingDown className={cls} />;
  return <Minus className={cls} />;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [ibkrToken, setIbkrToken] = useState("");
  const [ibkrQueryId, setIbkrQueryId] = useState("");
  const [ibkrLoading, setIbkrLoading] = useState(false);
  const [ibkrSyncing, setIbkrSyncing] = useState(false);
  const [newHolding, setNewHolding] = useState({ symbol: "", company_name: "", quantity: "", avg_price: "", sector: "", exchange: "" });

  // Load holdings
  useEffect(() => {
    if (!user) return;
    supabase.from("user_portfolios").select("*").eq("user_id", user.id).then(({ data }) => {
      if (data) setHoldings(data as PortfolioHolding[]);
    });
    supabase.from("profiles").select("ibkr_flex_token, ibkr_query_id").eq("id", user.id).single().then(({ data }) => {
      if (data?.ibkr_flex_token) setIbkrToken(data.ibkr_flex_token);
      if (data?.ibkr_query_id) setIbkrQueryId(data.ibkr_query_id);
    });
  }, [user]);

  // Load cached analyses for holdings
  useEffect(() => {
    if (holdings.length === 0) return;
    const symbols = holdings.map((h) => h.symbol);
    supabase.from("stock_analyses").select("*").in("symbol", symbols).then(({ data }) => {
      if (!data) return;
      const map: Record<string, AnalysisResult> = {};
      data.forEach((row: any) => {
        const raw = row.raw_scraped_data || {};
        map[row.symbol] = {
          id: row.id,
          company: { symbol: row.symbol, name: row.company_name, sector: row.sector, website: "", etf: row.etf, tradingViewSymbol: "" },
          overallScore: row.overall_score,
          sentiment: row.sentiment,
          summary: row.summary,
          websiteInsights: row.website_insights || "",
          financialHighlights: row.financial_highlights || "",
          newsDigest: row.news_digest || "",
          detailedAnalysis: raw.detailedAnalysis || "",
          competitivePosition: raw.competitivePosition || "",
          managementOutlook: raw.managementOutlook || "",
          strengths: row.strengths || [],
          risks: row.risks || [],
          citations: raw.citations || [],
          lastUpdated: row.updated_at,
          prediction: {
            priceTarget1w: row.price_target_1w, priceTarget1m: row.price_target_1m,
            priceTarget3m: row.price_target_3m, priceTarget1y: row.price_target_1y,
            recommendation: row.recommendation, confidenceScore: row.confidence_score,
            predictionReasoning: row.prediction_reasoning || "",
          },
          macro: {
            geopoliticalAnalysis: row.geopolitical_analysis || "",
            controversyScanner: row.controversy_scanner || "",
            macroEconomicFactors: row.macro_economic_factors || "",
            sectorTailwindsHeadwinds: row.sector_tailwinds_headwinds || "",
            regionalSentiment: row.regional_sentiment || "",
            mediaManipulationCheck: row.media_manipulation_check || "",
          },
        };
      });
      setAnalyses(map);
    });
  }, [holdings]);

  const addHolding = async () => {
    if (!user || !newHolding.symbol || !newHolding.company_name) return;
    const { error } = await supabase.from("user_portfolios").insert({
      user_id: user.id,
      symbol: newHolding.symbol.toUpperCase(),
      company_name: newHolding.company_name,
      quantity: parseFloat(newHolding.quantity) || 0,
      avg_price: parseFloat(newHolding.avg_price) || 0,
      sector: newHolding.sector || null,
      exchange: newHolding.exchange || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Holding added" });
      setNewHolding({ symbol: "", company_name: "", quantity: "", avg_price: "", sector: "", exchange: "" });
      setShowAddForm(false);
      // Reload
      const { data } = await supabase.from("user_portfolios").select("*").eq("user_id", user.id);
      if (data) setHoldings(data as PortfolioHolding[]);
    }
  };

  const removeHolding = async (id: string) => {
    await supabase.from("user_portfolios").delete().eq("id", id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const analyzeHolding = useCallback(async (holding: PortfolioHolding) => {
    setAnalyzingSymbols((prev) => new Set(prev).add(holding.symbol));
    try {
      const company: Company = {
        symbol: holding.symbol,
        name: holding.company_name,
        sector: holding.sector || "Unknown",
        website: "",
        etf: "spy",
        tradingViewSymbol: holding.symbol,
      };
      const result = await analyzeCompanyAPI(company);
      setAnalyses((prev) => ({ ...prev, [holding.symbol]: result }));
      toast({ title: `Analysis complete: ${holding.symbol}`, description: `Score: ${result.overallScore}/100` });
    } catch (err: any) {
      toast({ title: `Analysis failed`, description: err.message, variant: "destructive" });
    } finally {
      setAnalyzingSymbols((prev) => { const n = new Set(prev); n.delete(holding.symbol); return n; });
    }
  }, [toast]);

  const analyzeAll = async () => {
    for (const h of holdings) {
      await analyzeHolding(h);
    }
  };

  const saveIbkrSettings = async () => {
    if (!user) return;
    setIbkrLoading(true);
    const { error } = await supabase.from("profiles").update({
      ibkr_flex_token: ibkrToken,
      ibkr_query_id: ibkrQueryId,
    }).eq("id", user.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "IBKR credentials saved" });
    setIbkrLoading(false);
    setShowSettings(false);
  };

  const fetchIBKRPortfolio = async () => {
    if (!ibkrToken || !ibkrQueryId) {
      toast({ title: "Configure IBKR first", description: "Go to Settings and enter your Flex Query Token and Query ID", variant: "destructive" });
      return;
    }
    if (!user) return;
    setIbkrSyncing(true);
    toast({ title: "Fetching from IBKR...", description: "Requesting Flex Query report — this may take a moment" });
    try {
      const { data, error } = await supabase.functions.invoke("ibkr-portfolio", {
        body: { token: ibkrToken, queryId: ibkrQueryId, userId: user.id },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to fetch portfolio");

      // Reload holdings
      const { data: holdings } = await supabase.from("user_portfolios").select("*").eq("user_id", user.id);
      if (holdings) setHoldings(holdings as PortfolioHolding[]);
      toast({ title: "Portfolio synced!", description: `Imported ${data.data.positionsCount} positions from IBKR` });
    } catch (err: any) {
      toast({ title: "IBKR Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setIbkrSyncing(false);
    }
  };

  // Portfolio stats
  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.avg_price, 0);
  const analyzedHoldings = holdings.filter((h) => analyses[h.symbol]);
  const avgScore = analyzedHoldings.length > 0
    ? Math.round(analyzedHoldings.reduce((sum, h) => sum + (analyses[h.symbol]?.overallScore || 0), 0) / analyzedHoldings.length)
    : 0;
  const bullish = analyzedHoldings.filter((h) => analyses[h.symbol]?.sentiment === "bullish").length;
  const bearish = analyzedHoldings.filter((h) => analyses[h.symbol]?.sentiment === "bearish").length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">My Portfolio</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/")} className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-secondary-foreground hover:bg-secondary/80">
              Market Dashboard
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="rounded-lg border border-border bg-secondary p-2 text-secondary-foreground hover:bg-secondary/80">
              <Settings className="h-4 w-4" />
            </button>
            <button onClick={signOut} className="rounded-lg border border-border bg-secondary p-2 text-secondary-foreground hover:bg-secondary/80">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* IBKR Settings Panel */}
          {showSettings && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> IBKR Flex Query Integration
              </h3>
              <p className="text-xs text-muted-foreground">
                Enter your IBKR Flex Query credentials. In IBKR Account Management → Reports → Flex Queries → create a "Portfolio" query, then generate a Flex Web Service Token.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Flex Token</label>
                  <input
                    type="password"
                    placeholder="Your Flex Web Service Token"
                    value={ibkrToken}
                    onChange={(e) => setIbkrToken(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Query ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 123456"
                    value={ibkrQueryId}
                    onChange={(e) => setIbkrQueryId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
              <button onClick={saveIbkrSettings} disabled={ibkrLoading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {ibkrLoading ? "Saving..." : "Save Credentials"}
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Holdings</p>
              <p className="text-2xl font-bold text-foreground">{holdings.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Portfolio Value</p>
              <p className="text-2xl font-bold text-foreground">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Avg AI Score</p>
              <p className="text-2xl font-bold text-foreground">{avgScore || "—"}<span className="text-sm text-muted-foreground">/100</span></p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Sentiment</p>
              <p className="text-sm font-medium text-foreground">
                <span className="text-gain">{bullish} Bullish</span> · <span className="text-loss">{bearish} Bearish</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add Holding
            </button>
            <button onClick={fetchIBKRPortfolio} disabled={ibkrSyncing} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50">
              {ibkrSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {ibkrSyncing ? "Syncing..." : "Sync from IBKR"}
            </button>
            {holdings.length > 0 && (
              <button onClick={analyzeAll} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground hover:bg-secondary/80">
                <BarChart3 className="h-4 w-4" /> Analyze All
              </button>
            )}
          </div>

          {/* Add Holding Form */}
          {showAddForm && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Add Holding</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <input placeholder="Symbol *" value={newHolding.symbol} onChange={(e) => setNewHolding((p) => ({ ...p, symbol: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <input placeholder="Company Name *" value={newHolding.company_name} onChange={(e) => setNewHolding((p) => ({ ...p, company_name: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <input placeholder="Quantity" type="number" value={newHolding.quantity} onChange={(e) => setNewHolding((p) => ({ ...p, quantity: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <input placeholder="Avg Price" type="number" value={newHolding.avg_price} onChange={(e) => setNewHolding((p) => ({ ...p, avg_price: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <input placeholder="Sector" value={newHolding.sector} onChange={(e) => setNewHolding((p) => ({ ...p, sector: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                <button onClick={addHolding} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Add</button>
              </div>
            </div>
          )}

          {/* Holdings List */}
          {holdings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <PieChart className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm text-muted-foreground">No holdings yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Add holdings manually or sync from your IBKR account</p>
            </div>
          ) : (
            <div className="space-y-3">
              {holdings.map((holding) => {
                const analysis = analyses[holding.symbol];
                const value = holding.quantity * holding.avg_price;
                const weight = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0";

                return (
                  <div key={holding.id} className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-primary">{holding.symbol}</span>
                          <span className="text-xs text-muted-foreground">{holding.company_name}</span>
                          {holding.sector && (
                            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{holding.sector}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60">{weight}% of portfolio</span>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{holding.quantity} shares</span>
                          <span>Avg ${holding.avg_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          <span className="font-medium text-foreground">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {analysis ? (
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/stock/${holding.symbol}`)}>
                            <SentimentIcon sentiment={analysis.sentiment} />
                            <ScoreBadge score={analysis.overallScore} />
                            {analysis.prediction?.recommendation && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                analysis.prediction.recommendation === "buy" ? "bg-gain/15 text-gain" :
                                analysis.prediction.recommendation === "sell" ? "bg-loss/15 text-loss" :
                                "bg-warning/15 text-warning"
                              }`}>{analysis.prediction.recommendation}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => analyzeHolding(holding)}
                            disabled={analyzingSymbols.has(holding.symbol)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                          >
                            {analyzingSymbols.has(holding.symbol) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            {analyzingSymbols.has(holding.symbol) ? "Analyzing" : "Analyze"}
                          </button>
                        )}
                        <button onClick={() => removeHolding(holding.id)} className="rounded p-1 text-muted-foreground hover:text-loss transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {analysis && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="line-clamp-2 text-xs text-muted-foreground">{analysis.summary}</p>
                        {analysis.prediction?.priceTarget1m && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            1M Target: <span className="font-medium text-foreground">{analysis.prediction.priceTarget1m.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            {analysis.prediction.confidenceScore && (
                              <span className="ml-1 text-muted-foreground/70">({analysis.prediction.confidenceScore}% conf.)</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Portfolio Recommendations */}
          {analyzedHoldings.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> AI Portfolio Recommendations
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {analyzedHoldings
                  .filter((h) => analyses[h.symbol]?.prediction?.recommendation === "sell")
                  .map((h) => (
                    <div key={h.id} className="rounded-lg border border-loss/20 bg-loss/5 p-3">
                      <p className="text-xs font-bold text-loss">⚠️ Consider Selling: {h.symbol}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{analyses[h.symbol]?.prediction?.predictionReasoning}</p>
                    </div>
                  ))}
                {analyzedHoldings
                  .filter((h) => analyses[h.symbol]?.prediction?.recommendation === "buy")
                  .map((h) => (
                    <div key={h.id} className="rounded-lg border border-gain/20 bg-gain/5 p-3">
                      <p className="text-xs font-bold text-gain">✅ Strong Hold: {h.symbol}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{analyses[h.symbol]?.prediction?.predictionReasoning}</p>
                    </div>
                  ))}
                {analyzedHoldings
                  .filter((h) => analyses[h.symbol]?.risks && analyses[h.symbol]!.risks.length > 0)
                  .slice(0, 3)
                  .map((h) => (
                    <div key={h.id} className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                      <p className="text-xs font-bold text-warning">🔍 Risk Alert: {h.symbol}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{analyses[h.symbol]?.risks[0]}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
