import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, RefreshCw, ExternalLink, Globe, FileText, Newspaper, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus, Target, Users, Loader2, BarChart3 } from "lucide-react";
import { findCompany, getSentimentColor, getScoreColor } from "@/lib/stockData";
import type { AnalysisResult } from "@/lib/stockData";
import { getCachedAnalysis, analyzeCompany } from "@/lib/api/stockAnalysis";
import { RealTimeChart } from "@/components/charts/RealTimeChart";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { useToast } from "@/hooks/use-toast";

// Yahoo Finance symbol mapping for Indian stocks
function getYahooSymbol(symbol: string, etf: string): string {
  if (etf === "nifty50") return `${symbol}.NS`;
  if (symbol === "BRK.B") return "BRK-B";
  return symbol;
}

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const company = symbol ? findCompany(symbol) : undefined;

  useEffect(() => {
    if (!symbol) return;
    getCachedAnalysis(symbol).then((cached) => {
      if (cached && company) {
        cached.company = company;
        setAnalysis(cached);
      }
      setIsLoading(false);
    });
  }, [symbol]);

  const runAnalysis = useCallback(async () => {
    if (!company) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeCompany(company);
      setAnalysis(result);
      toast({ title: "Analysis complete", description: `Score: ${result.overallScore}/100` });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }, [company, toast]);

  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg text-foreground">Stock not found</p>
          <button onClick={() => navigate("/")} className="mt-4 text-sm text-primary hover:underline">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const yahooSymbol = getYahooSymbol(company.symbol, company.etf);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">{company.symbol}</h1>
                <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{company.sector}</span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{company.etf === "nifty50" ? "Nifty 50" : "S&P 500"}</span>
              </div>
              <p className="text-sm text-muted-foreground">{company.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {analysis && <ScoreBadge score={analysis.overallScore} size="lg" />}
            <button
              onClick={runAnalysis}
              disabled={isAnalyzing}
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
          symbol={company.symbol}
          yahooSymbol={yahooSymbol}
          height={500}
          refreshInterval={30000}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !analysis ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-lg text-foreground">No analysis yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Click "Run Analysis" to scrape and evaluate {company.name}</p>
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

            {/* Analysis Grid */}
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
    </div>
  );
}

function AnalysisSection({ icon, title, content }: { icon: React.ReactNode; title: string; children?: React.ReactNode; content: string }) {
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
