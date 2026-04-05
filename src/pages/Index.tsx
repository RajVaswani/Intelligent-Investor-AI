import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/dashboard/Header";
import { ETFTabs } from "@/components/dashboard/ETFTabs";
import { CompanyCard } from "@/components/dashboard/CompanyCard";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { SectorAnalysis } from "@/components/dashboard/SectorAnalysis";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { TradingViewTicker } from "@/components/charts/TradingViewChart";
import { type ETFType, type Company, type AnalysisResult, getCompanies } from "@/lib/stockData";
import { analyzeCompany as analyzeCompanyAPI, getCachedAnalyses } from "@/lib/api/stockAnalysis";
import { useToast } from "@/hooks/use-toast";

const ETF_CHART_SYMBOLS: Record<ETFType, string> = {
  nifty50: "NSE:NIFTY",
  spy: "AMEX:SPY",
};

export default function Index() {
  const [activeETF, setActiveETF] = useState<ETFType>("nifty50");
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const companies = getCompanies(activeETF);
  const currentAnalyses = companies
    .map((c) => analyses[c.symbol])
    .filter(Boolean) as AnalysisResult[];

  const tickerSymbols = companies.slice(0, 6).map((c) => ({
    proName: c.tradingViewSymbol,
    title: c.symbol,
  }));

  useEffect(() => {
    getCachedAnalyses(activeETF).then((cached) => {
      const map: Record<string, AnalysisResult> = {};
      cached.forEach((a) => {
        const fullCompany = companies.find((c) => c.symbol === a.company.symbol);
        if (fullCompany) a.company = fullCompany;
        map[a.company.symbol] = a;
      });
      setAnalyses((prev) => ({ ...prev, ...map }));
    });
  }, [activeETF]);

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
    for (const company of companies) {
      await analyzeCompany(company);
    }
    setIsRefreshingAll(false);
  }, [companies, analyzeCompany]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onRefreshAll={refreshAll} isRefreshing={isRefreshingAll} />

      {/* Ticker Tape */}
      <div className="border-b border-border">
        <TradingViewTicker symbols={tickerSymbols} />
      </div>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* ETF Selector */}
          <div className="flex items-center justify-between">
            <ETFTabs activeETF={activeETF} onTabChange={setActiveETF} />
            <p className="text-xs text-muted-foreground">Top 10 constituents by weight</p>
          </div>

          {/* ETF Index Chart */}
          <TradingViewChart symbol={ETF_CHART_SYMBOLS[activeETF]} height={1050} />

          {/* Stats */}
          <StatsBar analyses={currentAnalyses} />

          {/* Main Grid: Companies + Sector Analysis */}
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* Company Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
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

            {/* Sector Analysis Sidebar */}
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
