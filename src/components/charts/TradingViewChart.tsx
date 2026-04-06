import { useEffect, useRef } from "react";

interface TradingViewChartProps {
  symbol: string;
  height?: number;
  theme?: "dark" | "light";
  interval?: string;
}

export function TradingViewChart({ symbol, height = 400, theme = "dark", interval = "1" }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "tradingview_advanced_" + Math.random().toString(36).slice(2);
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if ((window as any).TradingView) {
        new (window as any).TradingView.widget({
          container_id: widgetDiv.id,
          symbol,
          interval,
          timezone: "Etc/UTC",
          theme: theme === "dark" ? "dark" : "light",
          style: "1",
          locale: "en",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          allow_symbol_change: true,
          save_image: false,
          height,
          width: "100%",
          hide_side_toolbar: false,
          studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"],
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [symbol, height, theme, interval]);

  return (
    <div ref={containerRef} className="overflow-hidden rounded-xl border border-border" style={{ height }} />
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
