import type { IntradayData } from "@/lib/api/optionsData";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
} from "recharts";

interface Props {
  data: IntradayData | null;
  symbol: string;
}

export function IntradayAnalysis({ data, symbol }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        No intraday data available for {symbol}.
      </div>
    );
  }

  const chartData = data.candles.map((c) => ({
    time: new Date(c.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    price: c.close,
    vwap: c.vwap,
    volume: c.volume,
    high: c.high,
    low: c.low,
  }));

  const priceChange = data.regularMarketPrice - data.previousClose;
  const pctChange = (priceChange / data.previousClose) * 100;

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          { label: "Current", value: `$${data.regularMarketPrice.toFixed(2)}` },
          { label: "Change", value: `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)} (${pctChange.toFixed(2)}%)`, color: priceChange >= 0 },
          { label: "Day High", value: `$${data.dayHigh.toFixed(2)}` },
          { label: "Day Low", value: `$${data.dayLow.toFixed(2)}` },
          { label: "VWAP", value: `$${data.candles[data.candles.length - 1]?.vwap?.toFixed(2) || "–"}` },
          { label: "Pivot", value: `$${data.pivot.toFixed(2)}` },
        ].map((m, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className={`text-lg font-bold ${
              "color" in m ? (m.color ? "text-chart-2" : "text-destructive") : "text-foreground"
            }`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Price + VWAP chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Price vs VWAP (1-min)</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={data.support.s1} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `S1: $${data.support.s1.toFixed(2)}`, fontSize: 10, fill: "hsl(var(--destructive))" }} />
            <ReferenceLine y={data.resistance.r1} stroke="hsl(var(--chart-2))" strokeDasharray="5 5" label={{ value: `R1: $${data.resistance.r1.toFixed(2)}`, fontSize: 10, fill: "hsl(var(--chart-2))" }} />
            <ReferenceLine y={data.pivot} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Pivot", fontSize: 10, fill: "hsl(var(--primary))" }} />
            <Line type="monotone" dataKey="price" stroke="hsl(var(--foreground))" dot={false} strokeWidth={1.5} name="Price" />
            <Line type="monotone" dataKey="vwap" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="VWAP" />
            <Bar dataKey="volume" fill="hsl(var(--muted-foreground))" opacity={0.15} yAxisId="volume" name="Volume" />
            <YAxis yAxisId="volume" orientation="right" tick={false} width={0} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Support / Resistance */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Support & Resistance Levels</h3>
          <div className="space-y-2">
            {[
              { label: "Resistance 2 (R2)", value: data.resistance.r2, type: "resistance" },
              { label: "Resistance 1 (R1)", value: data.resistance.r1, type: "resistance" },
              { label: "Pivot Point", value: data.pivot, type: "pivot" },
              { label: "Support 1 (S1)", value: data.support.s1, type: "support" },
              { label: "Support 2 (S2)", value: data.support.s2, type: "support" },
            ].map((lvl, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">{lvl.label}</span>
                <span className={`font-mono font-medium ${
                  lvl.type === "resistance" ? "text-chart-2" : lvl.type === "support" ? "text-destructive" : "text-primary"
                }`}>
                  ${lvl.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Volume Profile */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Volume Profile</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.volumeProfile} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis dataKey="price" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={55} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.6} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Understanding Intraday Indicators</h3>
        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
          <div><span className="font-medium text-foreground">VWAP</span> – Volume Weighted Average Price. When price is above VWAP, bulls are in control. Below VWAP indicates bearish pressure.</div>
          <div><span className="font-medium text-foreground">Support/Resistance</span> – Calculated from pivot points using day high, low, and close. Key levels where price tends to bounce or break.</div>
          <div><span className="font-medium text-foreground">Volume Profile</span> – Shows where most trading activity occurs. High volume nodes act as magnets; low volume nodes are breakout zones.</div>
        </div>
      </div>
    </div>
  );
}
