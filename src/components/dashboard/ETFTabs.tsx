import type { ETFType } from "@/lib/stockData";

interface ETFTabsProps {
  activeETF: ETFType;
  onTabChange: (etf: ETFType) => void;
}

export function ETFTabs({ activeETF, onTabChange }: ETFTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      <button
        onClick={() => onTabChange("nifty50")}
        className={`rounded-md px-5 py-2 text-sm font-medium transition-all ${
          activeETF === "nifty50"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇮🇳 Nifty 50
      </button>
      <button
        onClick={() => onTabChange("spy")}
        className={`rounded-md px-5 py-2 text-sm font-medium transition-all ${
          activeETF === "spy"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇺🇸 S&P 500 (SPY)
      </button>
    </div>
  );
}
