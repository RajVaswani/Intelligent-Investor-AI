import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { ETFTabs } from "@/components/dashboard/ETFTabs";
import { CompanyCard } from "@/components/dashboard/CompanyCard";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { SectorAnalysis } from "@/components/dashboard/SectorAnalysis";
import { RealTimeChart } from "@/components/charts/RealTimeChart";
import { type ETFType, type Company, type AnalysisResult } from "@/lib/stockData";
import { getFullCompanies } from "@/lib/companyData";
import { analyzeCompany as analyzeCompanyAPI, getCachedAnalyses } from "@/lib/api/stockAnalysis";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, ChevronDown, ChevronUp } from "lucide-react";

const ETF_CHART: Record<ETFType, { symbol: string; yahoo: string }> = {
  nifty50: { symbol: "NIFTY 50", yahoo: "^NSEI" },
  spy: { symbol: "SPY", yahoo: "SPY" },
};

const PAGE_SIZE = 30;

export default function Market() {
  const [activeETF, setActiveETF] = useState<ETFType>("nifty50");
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, [activeETF, allCompanies]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      loadCached();
    }, 30000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [loadCached]);

  // Reset visible count on filter/search/etf change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeETF, search, sectorFilter]);

  const analyzeCompany = useCallback(
    async (company: Company) => {
      setAnalyzingSymbols((prev) => new Set(prev).add(company.symbol));
      try {
        const result = await analyzeCompanyAPI(company);
        setAnalyses((prev) => ({ ...prev, [company.symbol]: result }));
        toast({ title: `Analysis complete: ${company.symbol}`, description: `Score: ${result.overallScore}/100 — ${result.sentiment}` });
      } catch (err: any) {
        toast({ title: `Analysis failed: ${company.symbol}`, description: err.message || "Something went wrong", variant: "destructive" });
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

  const refreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    // Only refresh visible/filtered companies to avoid overwhelming
    for (const company of visibleCompanies) {
      await analyzeCompany(company);
    }
    setIsRefreshingAll(false);
  }, [visibleCompanies, analyzeCompany]);

  const etfChart = ETF_CHART[activeETF];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onRefreshAll={refreshAll} isRefreshing={isRefreshingAll} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
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
                    onAnalyze={analyzeCompany}
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
