import { X, Globe, FileText, Newspaper, Shield, AlertTriangle, RefreshCw } from "lucide-react";
import type { AnalysisResult } from "@/lib/stockData";
import { getSentimentColor, getScoreColor } from "@/lib/stockData";
import { ScoreBadge } from "./ScoreBadge";

interface CompanyDetailProps {
  analysis: AnalysisResult;
  onClose: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function CompanyDetail({ analysis, onClose, onRefresh, isRefreshing }: CompanyDetailProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 backdrop-blur p-5">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">{analysis.company.symbol}</h2>
              <span className={`text-sm font-medium capitalize ${getSentimentColor(analysis.sentiment)}`}>
                {analysis.sentiment}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{analysis.company.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={analysis.overallScore} size="lg" />
            <button onClick={onClose} className="ml-2 rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* Summary */}
          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="text-sm leading-relaxed text-foreground">{analysis.summary}</p>
          </div>

          {/* Website Insights */}
          <Section icon={<Globe className="h-4 w-4 text-primary" />} title="Website Insights">
            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.websiteInsights}</p>
          </Section>

          {/* Financial Highlights */}
          <Section icon={<FileText className="h-4 w-4 text-gain" />} title="Financial Highlights">
            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.financialHighlights}</p>
          </Section>

          {/* News Digest */}
          <Section icon={<Newspaper className="h-4 w-4 text-warning" />} title="News Digest">
            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.newsDigest}</p>
          </Section>

          {/* Strengths & Risks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gain/20 bg-gain/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-gain" />
                <h3 className="text-sm font-semibold text-gain">Strengths</h3>
              </div>
              <ul className="space-y-1.5">
                {analysis.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-loss/20 bg-loss/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-loss" />
                <h3 className="text-sm font-semibold text-loss">Risks</h3>
              </div>
              <ul className="space-y-1.5">
                {analysis.risks.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>Last updated: {new Date(analysis.lastUpdated).toLocaleString()}</span>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh Analysis"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}
