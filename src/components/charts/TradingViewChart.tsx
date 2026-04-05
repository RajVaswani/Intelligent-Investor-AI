import { useEffect, useRef } from "react";

interface TradingViewChartProps {
  symbol: string;
  height?: number;
  theme?: "dark" | "light";
  interval?: string;
}

export function TradingViewChart({ symbol, height = 400, theme = "dark", interval = "D" }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      backgroundColor: "rgba(15, 17, 23, 1)",
      gridColor: "rgba(30, 35, 45, 0.5)",
    });

    containerRef.current.appendChild(script);
  }, [symbol, interval, theme]);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} style={{ height }} className="tradingview-widget-container" />
    </div>
  );
}

interface TradingViewMiniChartProps {
  symbol: string;
  height?: number;
}

export function TradingViewMiniChart({ symbol, height = 220 }: TradingViewMiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height,
      locale: "en",
      dateRange: "3M",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
      noTimeScale: false,
    });

    containerRef.current.appendChild(script);
  }, [symbol, height]);

  return (
    <div ref={containerRef} style={{ height }} className="tradingview-widget-container overflow-hidden rounded-xl border border-border" />
  );
}

interface TradingViewTickerProps {
  symbols: { proName: string; title: string }[];
}

export function TradingViewTicker({ symbols }: TradingViewTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols,
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "dark",
      locale: "en",
    });

    containerRef.current.appendChild(script);
  }, [symbols]);

  return (
    <div ref={containerRef} className="tradingview-widget-container" />
  );
}
