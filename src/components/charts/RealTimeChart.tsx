import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { fetchStockData, type StockCandle } from "@/lib/api/stockData";

interface RealTimeChartProps {
  symbol: string;
  yahooSymbol: string;
  height?: number;
  refreshInterval?: number; // ms
}

const RANGE_OPTIONS = [
  { label: "1D", range: "1d", interval: "5m" },
  { label: "5D", range: "5d", interval: "15m" },
  { label: "1M", range: "1mo", interval: "1h" },
  { label: "3M", range: "3mo", interval: "1d" },
  { label: "6M", range: "6mo", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1d" },
  { label: "5Y", range: "5y", interval: "1wk" },
];

function formatTime(ts: number, range: string) {
  const d = new Date(ts);
  if (range === "1d" || range === "5d") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1mo" || range === "3mo") {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

function formatPrice(val: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(val);
}

function formatVolume(vol: number) {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toString();
}

export function RealTimeChart({ symbol, yahooSymbol, height = 500, refreshInterval = 30000 }: RealTimeChartProps) {
  const [candles, setCandles] = useState<StockCandle[]>([]);
  const [meta, setMeta] = useState<{ price: number; previousClose: number; currency: string; exchange: string } | null>(null);
  const [activeRange, setActiveRange] = useState(RANGE_OPTIONS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const loadData = useCallback(async (range = activeRange) => {
    try {
      const data = await fetchStockData(yahooSymbol, range.range, range.interval);
      if (data) {
        setCandles(data.candles);
        setMeta({
          price: data.regularMarketPrice,
          previousClose: data.previousClose,
          currency: data.currency,
          exchange: data.exchange,
        });
        setError(null);
      } else {
        setError("Failed to load data");
      }
    } catch {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  }, [yahooSymbol, activeRange]);

  useEffect(() => {
    setIsLoading(true);
    loadData();

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (activeRange.range === "1d" || activeRange.range === "5d") {
      intervalRef.current = setInterval(() => loadData(), refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [yahooSymbol, activeRange, loadData, refreshInterval]);

  const handleRangeChange = (opt: typeof RANGE_OPTIONS[0]) => {
    setActiveRange(opt);
    setIsLoading(true);
    loadData(opt);
  };

  const firstClose = candles.length > 0 ? candles[0].close : 0;
  const lastClose = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const priceChange = lastClose - (meta?.previousClose || firstClose);
  const pctChange = meta?.previousClose ? ((lastClose - meta.previousClose) / meta.previousClose) * 100 : 0;
  const isPositive = priceChange >= 0;

  const chartColor = isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Price Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-foreground">
              {meta ? formatPrice(meta.price || lastClose, meta.currency) : "—"}
            </span>
            <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? "text-gain" : "text-loss"}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)} ({pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%)
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {symbol} · {meta?.exchange || "—"} · Real-time
            {activeRange.range === "1d" && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gain" />}
          </p>
        </div>
        {/* Range Selector */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleRangeChange(opt)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                activeRange.label === opt.label
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height }}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={candles} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tickFormatter={(t) => formatTime(t, activeRange.range)}
                tick={{ fontSize: 10, fill: "hsl(215 12% 55%)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={50}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "hsl(215 12% 55%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v.toFixed(2)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220 18% 12%)",
                  border: "1px solid hsl(220 14% 18%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(value: number, name: string) => {
                  if (name === "volume") return [formatVolume(value), "Volume"];
                  return [meta ? formatPrice(value, meta.currency) : value.toFixed(2), name.charAt(0).toUpperCase() + name.slice(1)];
                }}
              />
              {meta?.previousClose && (
                <ReferenceLine
                  y={meta.previousClose}
                  stroke="hsl(215 12% 35%)"
                  strokeDasharray="4 4"
                  label={{ value: "Prev Close", position: "right", fontSize: 10, fill: "hsl(215 12% 55%)" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#gradient-${symbol})`}
                dot={false}
                activeDot={{ r: 4, fill: chartColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
