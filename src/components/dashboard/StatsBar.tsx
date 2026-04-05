import type { AnalysisResult } from "@/lib/stockData";
import { TrendingUp, TrendingDown, BarChart3, Clock } from "lucide-react";

interface StatsBarProps {
  analyses: AnalysisResult[];
}

export function StatsBar({ analyses }: StatsBarProps) {
  if (analyses.length === 0) return null;

  const avgScore = Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length);
  const bullish = analyses.filter((a) => a.sentiment === "bullish").length;
  const bearish = analyses.filter((a) => a.sentiment === "bearish").length;

  const stats = [
    { icon: <BarChart3 className="h-4 w-4 text-primary" />, label: "Avg Score", value: `${avgScore}/100` },
    { icon: <TrendingUp className="h-4 w-4 text-gain" />, label: "Bullish", value: bullish.toString() },
    { icon: <TrendingDown className="h-4 w-4 text-loss" />, label: "Bearish", value: bearish.toString() },
    { icon: <Clock className="h-4 w-4 text-muted-foreground" />, label: "Analyzed", value: `${analyses.length}/10` },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {stat.icon}
          <div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-bold text-foreground">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
