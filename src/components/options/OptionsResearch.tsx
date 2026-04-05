import type { AnalysisResult } from "@/lib/stockData";
import { Loader2, Globe, TrendingUp, Newspaper, Shield, AlertTriangle, BarChart3, Brain, Scale, Radio, Eye } from "lucide-react";

interface Props {
  analysis: AnalysisResult | null;
  symbol: string;
  loading: boolean;
}

export function OptionsResearch({ analysis, symbol, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mt-3 text-muted-foreground">Loading research for {symbol}…</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Brain className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold text-foreground">No Research Data</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Go to the Market Dashboard and run analysis for {symbol} first. The micro/macro research will appear here once available.
        </p>
      </div>
    );
  }

  const sections = [
    {
      title: "Executive Summary",
      icon: <TrendingUp className="h-4 w-4" />,
      content: analysis.summary,
      color: "text-primary",
    },
    {
      title: "Financial Highlights",
      icon: <BarChart3 className="h-4 w-4" />,
      content: analysis.financialHighlights,
      color: "text-chart-2",
    },
    {
      title: "News Digest",
      icon: <Newspaper className="h-4 w-4" />,
      content: analysis.newsDigest,
      color: "text-chart-4",
    },
    {
      title: "Website Insights",
      icon: <Globe className="h-4 w-4" />,
      content: analysis.websiteInsights,
      color: "text-chart-3",
    },
    {
      title: "Detailed Analysis",
      icon: <Brain className="h-4 w-4" />,
      content: analysis.detailedAnalysis,
      color: "text-primary",
    },
    {
      title: "Competitive Position",
      icon: <Scale className="h-4 w-4" />,
      content: analysis.competitivePosition,
      color: "text-chart-2",
    },
    {
      title: "Management Outlook",
      icon: <Eye className="h-4 w-4" />,
      content: analysis.managementOutlook,
      color: "text-chart-5",
    },
  ];

  const macroSections = [
    {
      title: "Geopolitical Analysis",
      icon: <Globe className="h-4 w-4" />,
      content: analysis.macro?.geopoliticalAnalysis,
      color: "text-destructive",
    },
    {
      title: "Controversy Scanner",
      icon: <AlertTriangle className="h-4 w-4" />,
      content: analysis.macro?.controversyScanner,
      color: "text-destructive",
    },
    {
      title: "Macro-Economic Factors",
      icon: <BarChart3 className="h-4 w-4" />,
      content: analysis.macro?.macroEconomicFactors,
      color: "text-chart-4",
    },
    {
      title: "Sector Tailwinds & Headwinds",
      icon: <TrendingUp className="h-4 w-4" />,
      content: analysis.macro?.sectorTailwindsHeadwinds,
      color: "text-chart-3",
    },
    {
      title: "Regional Sentiment",
      icon: <Radio className="h-4 w-4" />,
      content: analysis.macro?.regionalSentiment,
      color: "text-primary",
    },
    {
      title: "Media Manipulation Check",
      icon: <Shield className="h-4 w-4" />,
      content: analysis.macro?.mediaManipulationCheck,
      color: "text-chart-5",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Score + Sentiment + Prediction header */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs text-muted-foreground">Overall Score</div>
          <div className={`text-3xl font-bold ${
            analysis.overallScore >= 70 ? "text-chart-2" :
            analysis.overallScore >= 40 ? "text-chart-4" : "text-destructive"
          }`}>{analysis.overallScore}/100</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs text-muted-foreground">Sentiment</div>
          <div className={`text-xl font-bold capitalize ${
            analysis.sentiment === "bullish" ? "text-chart-2" :
            analysis.sentiment === "bearish" ? "text-destructive" : "text-muted-foreground"
          }`}>{analysis.sentiment}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs text-muted-foreground">Recommendation</div>
          <div className={`text-xl font-bold uppercase ${
            analysis.prediction?.recommendation === "buy" ? "text-chart-2" :
            analysis.prediction?.recommendation === "sell" ? "text-destructive" : "text-chart-4"
          }`}>{analysis.prediction?.recommendation || "–"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs text-muted-foreground">Confidence</div>
          <div className="text-xl font-bold text-primary">{analysis.prediction?.confidenceScore || "–"}%</div>
        </div>
      </div>

      {/* Price Targets */}
      {analysis.prediction && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">AI Price Targets</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "1 Week", value: analysis.prediction.priceTarget1w },
              { label: "1 Month", value: analysis.prediction.priceTarget1m },
              { label: "3 Months", value: analysis.prediction.priceTarget3m },
              { label: "1 Year", value: analysis.prediction.priceTarget1y },
            ].map((t, i) => (
              <div key={i} className="text-center">
                <div className="text-xs text-muted-foreground">{t.label}</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {t.value ? `$${Number(t.value).toFixed(2)}` : "–"}
                </div>
              </div>
            ))}
          </div>
          {analysis.prediction.predictionReasoning && (
            <p className="mt-3 text-xs text-muted-foreground">{analysis.prediction.predictionReasoning}</p>
          )}
        </div>
      )}

      {/* Strengths & Risks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-chart-2/30 bg-chart-2/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-chart-2">Strengths</h3>
          <ul className="space-y-1">
            {analysis.strengths?.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-0.5 text-chart-2">✓</span> {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-destructive">Risks</h3>
          <ul className="space-y-1">
            {analysis.risks?.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-0.5 text-destructive">✗</span> {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Micro Analysis */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
          <Brain className="h-5 w-5 text-primary" /> Micro Analysis
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.filter(s => s.content).map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <h4 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${s.color}`}>
                {s.icon} {s.title}
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Macro Analysis */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
          <Globe className="h-5 w-5 text-destructive" /> Macro & Geopolitical Analysis
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {macroSections.filter(s => s.content).map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <h4 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${s.color}`}>
                {s.icon} {s.title}
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Citations */}
      {analysis.citations && analysis.citations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Sources & Citations</h3>
          <div className="flex flex-wrap gap-2">
            {analysis.citations.map((c: any, i: number) => (
              <a
                key={i}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-2 py-1 text-[10px] text-primary hover:bg-primary/5 transition-colors"
              >
                {c.source || c.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Last updated */}
      <p className="text-center text-[10px] text-muted-foreground">
        Last updated: {analysis.lastUpdated ? new Date(analysis.lastUpdated).toLocaleString() : "Unknown"}
      </p>
    </div>
  );
}
