import { useState, useCallback } from "react";
import { Header } from "@/components/dashboard/Header";
import { ETFTabs } from "@/components/dashboard/ETFTabs";
import { CompanyCard } from "@/components/dashboard/CompanyCard";
import { CompanyDetail } from "@/components/dashboard/CompanyDetail";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { type ETFType, type Company, type AnalysisResult, getCompanies } from "@/lib/stockData";
import { useToast } from "@/hooks/use-toast";

// Placeholder analysis generator (will be replaced with real scraping + AI)
function generateMockAnalysis(company: Company): AnalysisResult {
  const score = Math.floor(Math.random() * 40) + 50;
  const sentiments: Array<"bullish" | "bearish" | "neutral"> = ["bullish", "bearish", "neutral"];
  const sentiment = sentiments[score >= 70 ? 0 : score >= 50 ? 2 : 1];

  return {
    id: `${company.symbol}-${Date.now()}`,
    company,
    overallScore: score,
    sentiment,
    summary: `${company.name} shows ${sentiment} signals based on recent quarterly performance, market positioning, and news sentiment analysis. The company operates in the ${company.sector} sector with notable developments in Q1 2026.`,
    websiteInsights: `Analysis of ${company.website} reveals the company is focusing on digital transformation and sustainability initiatives. Recent product launches and strategic partnerships are highlighted prominently.`,
    financialHighlights: `Revenue growth of ${(Math.random() * 15 + 5).toFixed(1)}% YoY with improving margins. Operating cash flow remains strong with strategic capital allocation towards growth initiatives.`,
    newsDigest: `Recent coverage from Bloomberg, Reuters, and financial outlets indicates ${sentiment} market sentiment. Key themes include sector dynamics, regulatory developments, and competitive positioning.`,
    strengths: [
      "Strong market position in core segments",
      "Consistent revenue growth trajectory",
      "Robust balance sheet and cash reserves",
      "Strategic investments in emerging technologies",
    ],
    risks: [
      "Regulatory headwinds in key markets",
      "Competitive pressure from new entrants",
      "Currency fluctuation exposure",
      "Supply chain concentration risks",
    ],
    lastUpdated: new Date().toISOString(),
  };
}

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

  const analyzeCompany = useCallback(
    async (company: Company) => {
      setAnalyzingSymbols((prev) => new Set(prev).add(company.symbol));

      // Simulate scraping + AI analysis delay (will be replaced with real API calls)
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1500));

      const result = generateMockAnalysis(company);
      setAnalyses((prev) => ({ ...prev, [company.symbol]: result }));
      setAnalyzingSymbols((prev) => {
        const next = new Set(prev);
        next.delete(company.symbol);
        return next;
      });

      toast({
        title: `Analysis complete: ${company.symbol}`,
        description: `Score: ${result.overallScore}/100 — ${result.sentiment}`,
      });
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
          {/* ETF Selector */}
          <div className="flex items-center justify-between">
            <ETFTabs activeETF={activeETF} onTabChange={setActiveETF} />
            <p className="text-xs text-muted-foreground">Top 10 constituents by weight</p>
          </div>

          {/* Stats */}
          <StatsBar analyses={currentAnalyses} />

          {/* Company Grid */}
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

          {/* Disclaimer */}
          <p className="text-center text-[10px] text-muted-foreground/50">
            This analysis is AI-generated from publicly available data and should not be considered financial advice.
          </p>
        </div>
      </main>

      {/* Detail Modal */}
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
