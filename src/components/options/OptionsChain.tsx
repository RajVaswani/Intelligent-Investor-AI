import { useState } from "react";
import type { OptionsChainData, OptionContract } from "@/lib/api/optionsData";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  data: OptionsChainData | null;
}

export function OptionsChain({ data }: Props) {
  const [showCalls, setShowCalls] = useState(true);

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        No options chain data available. Try a US-listed stock symbol.
      </div>
    );
  }

  const contracts = showCalls ? data.calls : data.puts;
  const price = data.regularMarketPrice;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCalls(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            showCalls ? "bg-chart-2/20 text-chart-2" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUp className="mr-1 inline h-3 w-3" /> Calls ({data.calls.length})
        </button>
        <button
          onClick={() => setShowCalls(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            !showCalls ? "bg-destructive/20 text-destructive" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDown className="mr-1 inline h-3 w-3" /> Puts ({data.puts.length})
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.expirations.length} expiration dates available
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2">Strike</th>
              <th className="px-3 py-2">Last</th>
              <th className="px-3 py-2">Bid</th>
              <th className="px-3 py-2">Ask</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">OI</th>
              <th className="px-3 py-2">IV</th>
              <th className="px-3 py-2">ITM</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c, i) => {
              const isAtm = Math.abs(c.strike - price) / price < 0.005;
              return (
                <tr
                  key={i}
                  className={`border-b border-border transition-colors hover:bg-muted/30 ${
                    isAtm ? "bg-primary/5 font-medium" : ""
                  } ${c.inTheMoney ? (showCalls ? "bg-chart-2/5" : "bg-destructive/5") : ""}`}
                >
                  <td className="px-3 py-2 font-mono font-medium text-foreground">
                    ${c.strike.toFixed(2)}
                    {isAtm && <span className="ml-1 text-[10px] text-primary">ATM</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">${c.lastPrice?.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">${c.bid?.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">${c.ask?.toFixed(2)}</td>
                  <td className={`px-3 py-2 font-mono ${c.change >= 0 ? "text-chart-2" : "text-destructive"}`}>
                    {c.change >= 0 ? "+" : ""}{c.change?.toFixed(2)} ({c.percentChange?.toFixed(1)}%)
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.volume?.toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.openInterest?.toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{(c.impliedVolatility * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">
                    {c.inTheMoney && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        showCalls ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"
                      }`}>
                        ITM
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Greeks Legend */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Understanding the Greeks</h3>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-5">
          <div><span className="font-medium text-foreground">IV</span> – Implied Volatility: expected price swing</div>
          <div><span className="font-medium text-foreground">OI</span> – Open Interest: total open contracts</div>
          <div><span className="font-medium text-foreground">ITM</span> – In The Money: intrinsic value &gt; 0</div>
          <div><span className="font-medium text-foreground">Bid/Ask</span> – Market maker spread</div>
          <div><span className="font-medium text-foreground">ATM</span> – At The Money: strike ≈ current price</div>
        </div>
      </div>
    </div>
  );
}
