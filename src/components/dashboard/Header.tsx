import { Activity, RefreshCw, User, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  onRefreshAll?: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefreshAll, isRefreshing }: HeaderProps) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  return (
    <header className="border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">StockPulse AI</h1>
            <p className="text-xs text-muted-foreground">AI-Powered ETF Analysis Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefreshAll && (
            <button
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Analyzing..." : "Refresh All"}
            </button>
          )}
          <button
            onClick={() => navigate(user ? "/dashboard" : "/auth")}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <User className="h-4 w-4" />
            {user ? "My Portfolio" : "Sign In"}
          </button>
        </div>
      </div>
    </header>
  );
}
