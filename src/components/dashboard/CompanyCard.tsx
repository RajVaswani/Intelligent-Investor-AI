import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from "lucide-react";
import type { AnalysisResult, Company } from "@/lib/stockData";
import { getSentimentColor } from "@/lib/stockData";
import { ScoreBadge } from "./ScoreBadge";

interface CompanyCardProps {
  company: Company;
  analysis?: AnalysisResult;
  onAnalyze: (company: Company) => void;
  onClick: (company: Company) => void;
  isAnalyzing?: boolean;
}

function SentimentIcon({ sentiment }: { sentiment: "bullish" | "bearish" | "neutral" }) {
  const cls = `h-4 w-4 ${getSentimentColor(sentiment)}`;
  if (sentiment === "bullish") return <TrendingUp className={cls} />;
  if (sentiment === "bearish") return <TrendingDown className={cls} />;
  return <Minus className={cls} />;
}

export function CompanyCard({ company, analysis, onAnalyze, onClick, isAnalyzing }: CompanyCardProps) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
      onClick={() => analysis && onClick(company)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-primary">{company.symbol}</span>
            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              {company.sector}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{company.name}</p>
        </div>

        {analysis ? (
          <ScoreBadge score={analysis.overallScore} />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze(company);
            }}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isAnalyzing ? "Analyzing" : "Analyze"}
          </button>
        )}
      </div>

      {analysis && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <SentimentIcon sentiment={analysis.sentiment} />
            <span className={`text-xs font-medium capitalize ${getSentimentColor(analysis.sentiment)}`}>
              {analysis.sentiment}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(analysis.lastUpdated).toLocaleDateString()}
            </span>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{analysis.summary}</p>
        </div>
      )}

      {!analysis && !isAnalyzing && (
        <p className="mt-3 text-xs text-muted-foreground/60">
          Click "Analyze" to scrape and evaluate this company
        </p>
      )}
    </div>
  );
}
