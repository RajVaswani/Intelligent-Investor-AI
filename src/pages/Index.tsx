import { useState, useCallback, useEffect } from "react";
import { Header } from "@/components/dashboard/Header";
import { ETFTabs } from "@/components/dashboard/ETFTabs";
import { CompanyCard } from "@/components/dashboard/CompanyCard";
import { CompanyDetail } from "@/components/dashboard/CompanyDetail";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { type ETFType, type Company, type AnalysisResult, getCompanies } from "@/lib/stockData";
import { analyzeCompany as analyzeCompanyAPI, getCachedAnalyses } from "@/lib/api/stockAnalysis";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const [activeETF, setActiveETF] = useState<ETFType>("nifty50");
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const { toast } = useToast();

  const companies = getCompanies(activeETF);
  const currentAnalyses = companies
    .map((c) => analyses[c.symbol])
    .filter(Boolean) as AnalysisResult[];

  // Load cached analyses on ETF switch
  useEffect(() => {
    getCachedAnalyses(activeETF).then((cached) => {
      const map: Record<string, AnalysisResult> = {};
      cached.forEach((a) => {
        // Restore the full company data from our constants
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
        toast({
          title: `Analysis complete: ${company.symbol}`,
          description: `Score: ${result.overallScore}/100 — ${result.sentiment}`,
        });
      } catch (err: any) {
        toast({
          title: `Analysis failed: ${company.symbol}`,
          description: err.message || "Something went wrong",
          variant: "destructive",
        });
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

  const selectedAnalysis = selectedCompany ? analyses[selectedCompany.symbol] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onRefreshAll={refreshAll} isRefreshing={isRefreshingAll} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <ETFTabs activeETF={activeETF} onTabChange={setActiveETF} />
            <p className="text-xs text-muted-foreground">Top 10 constituents by weight</p>
          </div>

          <StatsBar analyses={currentAnalyses} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {companies.map((company) => (
              <CompanyCard
                key={company.symbol}
                company={company}
                analysis={analyses[company.symbol]}
                onAnalyze={analyzeCompany}
                onClick={setSelectedCompany}
                isAnalyzing={analyzingSymbols.has(company.symbol)}
              />
            ))}
          </div>

          <p className="text-center text-[10px] text-muted-foreground/50">
            AI-generated analysis from publicly available data. Not financial advice.
          </p>
        </div>
      </main>

      {selectedCompany && selectedAnalysis && (
        <CompanyDetail
          analysis={selectedAnalysis}
          onClose={() => setSelectedCompany(null)}
          onRefresh={() => analyzeCompany(selectedCompany)}
          isRefreshing={analyzingSymbols.has(selectedCompany.symbol)}
        />
      )}
    </div>
  );
}
