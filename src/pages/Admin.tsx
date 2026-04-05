import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Activity, ArrowLeft, Users, BarChart3, TrendingUp, TrendingDown, Minus, Shield } from "lucide-react";

interface UserInfo {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  holdings_count: number;
}

interface StockPerf {
  symbol: string;
  company_name: string;
  overall_score: number;
  sentiment: string;
  recommendation: string | null;
  confidence_score: number | null;
  updated_at: string;
}

export default function Admin() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stocks, setStocks] = useState<StockPerf[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<"users" | "stocks">("users");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadData();
  }, [user, isAdmin]);

  const loadData = async () => {
    setLoadingData(true);
    // Load profiles with portfolio counts
    const { data: profiles } = await supabase.from("profiles").select("*");
    const { data: portfolios } = await supabase.from("user_portfolios").select("user_id, symbol");

    const holdingsMap: Record<string, number> = {};
    portfolios?.forEach((p) => {
      holdingsMap[p.user_id] = (holdingsMap[p.user_id] || 0) + 1;
    });

    if (profiles) {
      setUsers(
        profiles.map((p) => ({
          id: p.id,
          email: p.email || "—",
          full_name: p.full_name,
          created_at: p.created_at,
          holdings_count: holdingsMap[p.id] || 0,
        }))
      );
    }

    // Load stock analyses
    const { data: analyses } = await supabase
      .from("stock_analyses")
      .select("symbol, company_name, overall_score, sentiment, recommendation, confidence_score, updated_at")
      .order("updated_at", { ascending: false });

    if (analyses) {
      // Deduplicate by symbol (latest first)
      const seen = new Set<string>();
      const unique: StockPerf[] = [];
      for (const a of analyses) {
        if (!seen.has(a.symbol)) {
          seen.add(a.symbol);
          unique.push(a);
        }
      }
      setStocks(unique);
    }
    setLoadingData(false);
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const sentimentIcon = (s: string) => {
    if (s === "bullish") return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (s === "bearish") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-yellow-500" />;
  };

  const avgScore = stocks.length ? Math.round(stocks.reduce((s, x) => s + x.overall_score, 0) / stocks.length) : 0;
  const bullishCount = stocks.filter((s) => s.sentiment === "bullish").length;
  const bearishCount = stocks.filter((s) => s.sentiment === "bearish").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">User analytics & stock performance overview</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-4 w-4" /> Total Users</div>
            <p className="text-2xl font-bold text-foreground">{users.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><BarChart3 className="h-4 w-4" /> Stocks Tracked</div>
            <p className="text-2xl font-bold text-foreground">{stocks.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-4 w-4" /> Avg Score</div>
            <p className="text-2xl font-bold text-foreground">{avgScore}/100</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Activity className="h-4 w-4" /> Sentiment</div>
            <p className="text-sm font-medium text-foreground">
              <span className="text-green-500">{bullishCount} Bull</span> / <span className="text-red-500">{bearishCount} Bear</span>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="inline h-4 w-4 mr-1" /> Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("stocks")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "stocks" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart3 className="inline h-4 w-4 mr-1" /> Stock Performance ({stocks.length})
          </button>
        </div>

        {loadingData ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : activeTab === "users" ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Holdings</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{u.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{u.holdings_count}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Symbol</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sentiment</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recommendation</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Confidence</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.symbol} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{s.symbol}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.company_name}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${s.overall_score >= 70 ? "text-green-500" : s.overall_score >= 40 ? "text-yellow-500" : "text-red-500"}`}>
                        {s.overall_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-1">{sentimentIcon(s.sentiment)} {s.sentiment}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{s.recommendation || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.confidence_score ? `${s.confidence_score}%` : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(s.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
