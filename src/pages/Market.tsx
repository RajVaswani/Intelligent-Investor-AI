import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { ETFTabs } from "@/components/dashboard/ETFTabs";
import { CompanyCard } from "@/components/dashboard/CompanyCard";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { SectorAnalysis } from "@/components/dashboard/SectorAnalysis";
import { RealTimeChart } from "@/components/charts/RealTimeChart";
import { OnboardingGuide } from "@/components/dashboard/OnboardingGuide";
import { type ETFType, type Company, type AnalysisResult } from "@/lib/stockData";
import { getFullCompanies } from "@/lib/companyData";
import { analyzeCompany as analyzeCompanyAPI, getCachedAnalyses } from "@/lib/api/stockAnalysis";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

const ETF_CHART: Record<ETFType, { symbol: string; yahoo: string }> = {
  nifty50: { symbol: "NIFTY 50", yahoo: "^NSEI" },
  spy: { symbol: "SPY", yahoo: "SPY" },
};

const PAGE_SIZE = 30;
const AUTO_ANALYZE_BATCH = 5; // analyze in batches of 5 concurrently
const REFRESH_INTERVAL = 30000;

export default function Market() {
  const [activeETF, setActiveETF] = useState<ETFType>("nifty50");
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [autoAnalyzeProgress, setAutoAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAnalyzeRef = useRef(false);
  const hasTriggeredAutoAnalyze = useRef<Record<string, boolean>>({});

  const allCompanies = useMemo(() => getFullCompanies(activeETF), [activeETF]);

  const sectors = useMemo(() => {
    const s = [...new Set(allCompanies.map((c) => c.sector))].sort();
    return ["All", ...s];
  }, [allCompanies]);

  const filtered = useMemo(() => {
    let list = allCompanies;
    if (sectorFilter !== "All") list = list.filter((c) => c.sector === sectorFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCompanies, sectorFilter, search]);

  const visibleCompanies = filtered.slice(0, visibleCount);

  const currentAnalyses = useMemo(
    () => allCompanies.map((c) => analyses[c.symbol]).filter(Boolean) as AnalysisResult[],
    [allCompanies, analyses]
  );

  // Load cached analyses
  const loadCached = useCallback(async () => {
    const cached = await getCachedAnalyses(activeETF);
    const map: Record<string, AnalysisResult> = {};
    cached.forEach((a) => {
      const fullCompany = allCompanies.find((c) => c.symbol === a.company.symbol);
      if (fullCompany) a.company = fullCompany;
      map[a.company.symbol] = a;
    });
    setAnalyses((prev) => ({ ...prev, ...map }));
    return map;
  }, [activeETF, allCompanies]);

  // Analyze a single company (silent mode for auto-analyze)
  const analyzeSingle = useCallback(
    async (company: Company, silent = false) => {
      setAnalyzingSymbols((prev) => new Set(prev).add(company.symbol));
      try {
        const result = await analyzeCompanyAPI(company);
        setAnalyses((prev) => ({ ...prev, [company.symbol]: result }));
        if (!silent) {
          toast({ title: `Analysis complete: ${company.symbol}`, description: `Score: ${result.overallScore}/100 — ${result.sentiment}` });
        }
      } catch {
        // Silent fail for auto-analyze, toast for manual
        if (!silent) {
          toast({ title: `Analysis failed: ${company.symbol}`, description: "Something went wrong", variant: "destructive" });
        }
      } finally {
        setAnalyzingSymbols((prev) => {
          const next = new Set(prev);
          next.delete(company.symbol);
          return next;
        });
      }
    },
    [toast]
  );

  // Auto-analyze: analyze stocks that don't have cached data
  const autoAnalyze = useCallback(async (cachedMap: Record<string, AnalysisResult>) => {
    if (autoAnalyzeRef.current) return;
    autoAnalyzeRef.current = true;

    const unanalyzed = allCompanies.filter((c) => !cachedMap[c.symbol]);
    if (unanalyzed.length === 0) {
      autoAnalyzeRef.current = false;
      return;
    }

    setAutoAnalyzeProgress({ done: 0, total: unanalyzed.length });

    // Process in batches
    for (let i = 0; i < unanalyzed.length; i += AUTO_ANALYZE_BATCH) {
      const batch = unanalyzed.slice(i, i + AUTO_ANALYZE_BATCH);
      await Promise.allSettled(batch.map((c) => analyzeSingle(c, true)));
      setAutoAnalyzeProgress({ done: Math.min(i + AUTO_ANALYZE_BATCH, unanalyzed.length), total: unanalyzed.length });
    }

    setAutoAnalyzeProgress(null);
    autoAnalyzeRef.current = false;
    toast({ title: "Auto-analysis complete", description: `Analyzed ${unanalyzed.length} stocks for ${activeETF === "nifty50" ? "Nifty 50" : "S&P 500"}` });
  }, [allCompanies, analyzeSingle, activeETF, toast]);

  // Initial load + trigger auto-analyze for unanalyzed stocks
  useEffect(() => {
    const etfKey = activeETF;
    if (hasTriggeredAutoAnalyze.current[etfKey]) {
      loadCached();
      return;
    }
    hasTriggeredAutoAnalyze.current[etfKey] = true;

    loadCached().then((cachedMap) => {
      autoAnalyze(cachedMap);
    });
  }, [activeETF, loadCached, autoAnalyze]);

  // Auto-refresh cached data every 30 seconds
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      loadCached();
    }, REFRESH_INTERVAL);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [loadCached]);

  // Auto re-analyze all stocks every 30 seconds (stale ones)
  useEffect(() => {
    const reAnalyzeInterval = setInterval(async () => {
      if (autoAnalyzeRef.current || isRefreshingAll) return;
      // Find stocks with analyses older than 5 minutes
      const staleThreshold = Date.now() - 5 * 60 * 1000;
      const stale = allCompanies.filter((c) => {
        const a = analyses[c.symbol];
        if (!a) return true;
        return new Date(a.lastUpdated).getTime() < staleThreshold;
      });
      if (stale.length > 0) {
        // Analyze top 5 stale stocks per cycle
        const batch = stale.slice(0, AUTO_ANALYZE_BATCH);
        await Promise.allSettled(batch.map((c) => analyzeSingle(c, true)));
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(reAnalyzeInterval);
  }, [allCompanies, analyses, analyzeSingle, isRefreshingAll]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeETF, search, sectorFilter]);

  const refreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    for (const company of visibleCompanies) {
      await analyzeSingle(company, false);
    }
    setIsRefreshingAll(false);
  }, [visibleCompanies, analyzeSingle]);

  const etfChart = ETF_CHART[activeETF];
  const analyzedCount = currentAnalyses.length;
  const totalCount = allCompanies.length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onRefreshAll={refreshAll} isRefreshing={isRefreshingAll} />

      {/* Onboarding Guide */}
      <OnboardingGuide />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Auto-analyze progress banner */}
          {autoAnalyzeProgress && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Auto-analyzing stocks...
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoAnalyzeProgress.done} of {autoAnalyzeProgress.total} completed
                </p>
              </div>
              <div className="h-2 w-32 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(autoAnalyzeProgress.done / autoAnalyzeProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Analysis coverage bar */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">Analysis Coverage:</span>
            <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${(analyzedCount / totalCount) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-foreground font-medium">
              {analyzedCount}/{totalCount}
            </span>
            <span className="text-[10px] text-muted-foreground">Auto-refreshing every 30s</span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ETFTabs activeETF={activeETF} onTabChange={setActiveETF} />
            <span className="text-xs text-muted-foreground">
              {activeETF === "nifty50" ? "All 50 constituents" : `${allCompanies.length} S&P 500 constituents`}
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by symbol or company name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowSectorDropdown(!showSectorDropdown)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <Filter className="h-4 w-4 text-muted-foreground" />
                {sectorFilter}
                {showSectorDropdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showSectorDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-60 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {sectors.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSectorFilter(s); setShowSectorDropdown(false); }}
                      className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                        s === sectorFilter ? "bg-accent text-accent-foreground" : "text-popover-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Real-time ETF Chart */}
          <RealTimeChart
            key={etfChart.yahoo}
            symbol={etfChart.symbol}
            yahooSymbol={etfChart.yahoo}
            height={500}
            refreshInterval={30000}
          />

          <StatsBar analyses={currentAnalyses} />

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {visibleCompanies.length} of {filtered.length} companies
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCompanies.map((company) => (
                  <CompanyCard
                    key={company.symbol}
                    company={company}
                    analysis={analyses[company.symbol]}
                    onAnalyze={(c) => analyzeSingle(c, false)}
                    onClick={(c) => navigate(`/stock/${c.symbol}`)}
                    isAnalyzing={analyzingSymbols.has(company.symbol)}
                  />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="rounded-lg border border-border bg-secondary px-6 py-2 text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    Load More ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <SectorAnalysis analyses={currentAnalyses} etf={activeETF} />
            </div>
          </div>

          <p className="text-center text-[10px] text-muted-foreground/50">
            AI-generated analysis from publicly available data. Not financial advice.
          </p>
        </div>
      </main>
    </div>
  );
}
