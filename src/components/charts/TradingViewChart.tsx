interface TradingViewChartProps {
  symbol: string;
  height?: number;
  theme?: "dark" | "light";
  interval?: string;
}

export function TradingViewChart({ symbol, height = 400, theme = "dark", interval = "1" }: TradingViewChartProps) {
  const src = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(symbol)}&interval=${interval}&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=${theme === "dark" ? "dark" : "light"}&style=1&timezone=Etc%2FUTC&withdateranges=1&showpopupbutton=0&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost`;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <iframe
        src={src}
        style={{ width: "100%", height }}
        frameBorder="0"
        allowTransparency
        scrolling="no"
        allowFullScreen
      />
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
