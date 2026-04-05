import type { AIStrategyResult } from "@/lib/api/optionsData";
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  data: AIStrategyResult | null;
  loading: boolean;
  onGenerate: () => void;
  symbol: string;
}

const typeIcon = {
  bullish: <TrendingUp className="h-4 w-4 text-chart-2" />,
  bearish: <TrendingDown className="h-4 w-4 text-destructive" />,
  neutral: <Minus className="h-4 w-4 text-muted-foreground" />,
};

const typeBg = {
  bullish: "border-chart-2/30 bg-chart-2/5",
  bearish: "border-destructive/30 bg-destructive/5",
  neutral: "border-border bg-muted/30",
};

export function AIStrategies({ data, loading, onGenerate, symbol }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Brain className="mb-3 h-10 w-10 animate-pulse text-primary" />
        <span className="text-muted-foreground">AI is analyzing {symbol} options…</span>
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Brain className="mb-3 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold text-foreground">AI Options Strategies</h3>
        <p className="mb-4 max-w-md text-sm text-muted-foreground">
          Our AI analyzes the options chain, implied volatility, and intraday patterns to recommend strategies with different risk profiles.
        </p>
        <button onClick={onGenerate} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Brain className="h-4 w-4" /> Generate Strategies
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outlook + IV */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Market Outlook</h3>
          <p className="text-sm text-muted-foreground">{data.marketOutlook}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">IV Analysis</h3>
          <p className="text-sm text-muted-foreground">{data.ivAnalysis}</p>
        </div>
      </div>

      {/* Strategies */}
      <div className="space-y-4">
        {data.strategies.map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 ${typeBg[s.type]}`}>
            <div className="mb-3 flex items-center gap-2">
              {typeIcon[s.type]}
              <h3 className="font-semibold text-foreground">{s.name}</h3>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                s.type === "bullish" ? "bg-chart-2/20 text-chart-2" :
                s.type === "bearish" ? "bg-destructive/20 text-destructive" :
                "bg-muted text-muted-foreground"
              }`}>
                {s.type}
              </span>
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {s.confidence}% confidence
              </div>
            </div>

            {/* Legs */}
            {s.legs.length > 0 && (
              <div className="mb-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-1 pr-4">Action</th>
                      <th className="pb-1 pr-4">Type</th>
                      <th className="pb-1 pr-4">Strike</th>
                      <th className="pb-1">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.legs.map((leg, j) => (
                      <tr key={j} className="text-foreground">
                        <td className={`py-0.5 pr-4 font-medium ${leg.action === "BUY" ? "text-chart-2" : "text-destructive"}`}>
                          {leg.action}
                        </td>
                        <td className="py-0.5 pr-4">{leg.type}</td>
                        <td className="py-0.5 pr-4 font-mono">${leg.strike}</td>
                        <td className="py-0.5 font-mono">${leg.premium?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Max Profit: </span>
                <span className="font-medium text-chart-2">{s.maxProfit}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max Loss: </span>
                <span className="font-medium text-destructive">{s.maxLoss}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Breakeven: </span>
                <span className="font-mono font-medium text-foreground">${s.breakeven?.toFixed(2)}</span>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{s.reasoning}</p>
          </div>
        ))}
      </div>

      {/* Risk warning */}
      {data.riskWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{data.riskWarning}</p>
        </div>
      )}

      {/* Regenerate */}
      <div className="flex justify-center">
        <button onClick={onGenerate} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-4 w-4" /> Regenerate Strategies
        </button>
      </div>
    </div>
  );
}
