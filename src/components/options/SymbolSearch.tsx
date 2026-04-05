import { useState } from "react";
import { Search } from "lucide-react";

const POPULAR = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ", "AMD"];

interface Props {
  value: string;
  onChange: (sym: string) => void;
}

export function SymbolSearch({ value, onChange }: Props) {
  const [input, setInput] = useState(value);

  const submit = () => {
    const s = input.trim().toUpperCase();
    if (s) onChange(s);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Enter symbol…"
            className="h-10 w-40 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={submit}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {POPULAR.map((s) => (
          <button
            key={s}
            onClick={() => { setInput(s); onChange(s); }}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              s === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
