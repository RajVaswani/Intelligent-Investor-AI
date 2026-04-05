import type { AnalysisResult, ETFType } from "@/lib/stockData";
import { getSectors, getCompanies } from "@/lib/stockData";
import { getScoreColor } from "@/lib/stockData";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

interface SectorAnalysisProps {
  analyses: AnalysisResult[];
  etf: ETFType;
}

export function SectorAnalysis({ analyses, etf }: SectorAnalysisProps) {
  if (analyses.length === 0) return null;

  const sectors = getSectors(etf);
  const companies = getCompanies(etf);

  const sectorData = sectors.map((sector) => {
    const sectorCompanies = companies.filter((c) => c.sector === sector);
    const sectorAnalyses = sectorCompanies
      .map((c) => analyses.find((a) => a.company.symbol === c.symbol))
      .filter(Boolean) as AnalysisResult[];

    const avgScore = sectorAnalyses.length > 0
      ? Math.round(sectorAnalyses.reduce((s, a) => s + a.overallScore, 0) / sectorAnalyses.length)
      : 0;

    const bullish = sectorAnalyses.filter((a) => a.sentiment === "bullish").length;
    const bearish = sectorAnalyses.filter((a) => a.sentiment === "bearish").length;
    const dominant = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";

    return {
      sector,
      avgScore,
      count: sectorAnalyses.length,
      total: sectorCompanies.length,
      dominant,
      companies: sectorAnalyses.map((a) => ({ symbol: a.company.symbol, score: a.overallScore, sentiment: a.sentiment })),
    };
  }).filter((s) => s.count > 0);

  if (sectorData.length === 0) return null;

  const overallAvg = Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length);
  const overallBullish = analyses.filter((a) => a.sentiment === "bullish").length;
  const overallBearish = analyses.filter((a) => a.sentiment === "bearish").length;
  const overallSentiment = overallBullish > overallBearish ? "Bullish" : overallBearish > overallBullish ? "Bearish" : "Neutral";

  return (
    <div className="space-y-4">
      {/* Overall Summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {etf === "nifty50" ? "🇮🇳 Nifty 50" : "🇺🇸 S&P 500"} — Cross-Industry Overview
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className={`text-2xl font-bold ${getScoreColor(overallAvg)}`}>{overallAvg}</p>
            <p className="text-xs text-muted-foreground">Avg Score</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${overallSentiment === "Bullish" ? "text-gain" : overallSentiment === "Bearish" ? "text-loss" : "text-warning"}`}>
              {overallSentiment}
            </p>
            <p className="text-xs text-muted-foreground">Overall Sentiment</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{analyses.length}/{getCompanies(etf).length}</p>
            <p className="text-xs text-muted-foreground">Analyzed</p>
          </div>
        </div>
      </div>

      {/* Sector Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Sector Scores</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={sectorData} layout="vertical">
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(215 12% 55%)" }} />
            <YAxis type="category" dataKey="sector" width={80} tick={{ fontSize: 11, fill: "hsl(210 20% 92%)" }} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "hsl(210 20% 92%)" }}
            />
            <Bar dataKey="avgScore" radius={[0, 4, 4, 0]}>
              {sectorData.map((entry, i) => (
                <Cell key={i} fill={entry.avgScore >= 70 ? "hsl(142 71% 45%)" : entry.avgScore >= 40 ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sector Breakdown */}
      {sectorData.map((s) => (
        <div key={s.sector} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{s.sector}</h4>
              <span className={`text-xs font-medium capitalize ${s.dominant === "bullish" ? "text-gain" : s.dominant === "bearish" ? "text-loss" : "text-warning"}`}>
                {s.dominant}
              </span>
            </div>
            <span className={`text-lg font-bold ${getScoreColor(s.avgScore)}`}>{s.avgScore}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.companies.map((c) => (
              <span key={c.symbol} className={`rounded-md bg-secondary px-2 py-1 text-xs ${getScoreColor(c.score)}`}>
                {c.symbol}: {c.score}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
