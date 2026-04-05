import { supabase } from "@/integrations/supabase/client";
import type { Company, AnalysisResult } from "@/lib/stockData";

export async function analyzeCompany(company: Company): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke("analyze-company", {
    body: {
      symbol: company.symbol,
      name: company.name,
      sector: company.sector,
      website: company.website,
      etf: company.etf,
    },
  });

  if (error) throw new Error(error.message || "Analysis failed");
  if (!data?.success) throw new Error(data?.error || "Analysis returned no data");

  const d = data.data;
  return {
    id: `${d.symbol}-${Date.now()}`,
    company,
    overallScore: d.overallScore || 50,
    sentiment: d.sentiment || "neutral",
    summary: d.summary || "",
    websiteInsights: d.websiteInsights || "",
    financialHighlights: d.financialHighlights || "",
    newsDigest: d.newsDigest || "",
    detailedAnalysis: d.detailedAnalysis || "",
    competitivePosition: d.competitivePosition || "",
    managementOutlook: d.managementOutlook || "",
    strengths: d.strengths || [],
    risks: d.risks || [],
    citations: d.citations || [],
    lastUpdated: d.lastUpdated || new Date().toISOString(),
  };
}

export async function getCachedAnalyses(etf: string): Promise<AnalysisResult[]> {
  const { data, error } = await supabase
    .from("stock_analyses")
    .select("*")
    .eq("etf", etf)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => {
    const raw = row.raw_scraped_data || {};
    return {
      id: row.id,
      company: {
        symbol: row.symbol,
        name: row.company_name,
        sector: row.sector,
        website: "",
        etf: row.etf,
        tradingViewSymbol: "",
      },
      overallScore: row.overall_score,
      sentiment: row.sentiment,
      summary: row.summary,
      websiteInsights: row.website_insights || "",
      financialHighlights: row.financial_highlights || "",
      newsDigest: row.news_digest || "",
      detailedAnalysis: raw.detailedAnalysis || "",
      competitivePosition: raw.competitivePosition || "",
      managementOutlook: raw.managementOutlook || "",
      strengths: row.strengths || [],
      risks: row.risks || [],
      citations: raw.citations || [],
      lastUpdated: row.updated_at,
    };
  });
}

export async function getCachedAnalysis(symbol: string): Promise<AnalysisResult | null> {
  const { data, error } = await supabase
    .from("stock_analyses")
    .select("*")
    .eq("symbol", symbol)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.raw_scraped_data as any || {};
  return {
    id: data.id,
    company: {
      symbol: data.symbol,
      name: data.company_name,
      sector: data.sector,
      website: "",
      etf: data.etf as any,
      tradingViewSymbol: "",
    },
    overallScore: data.overall_score,
    sentiment: data.sentiment as any,
    summary: data.summary,
    websiteInsights: data.website_insights || "",
    financialHighlights: data.financial_highlights || "",
    newsDigest: data.news_digest || "",
    detailedAnalysis: raw.detailedAnalysis || "",
    competitivePosition: raw.competitivePosition || "",
    managementOutlook: raw.managementOutlook || "",
    strengths: data.strengths || [],
    risks: data.risks || [],
    citations: raw.citations || [],
    lastUpdated: data.updated_at,
  };
}
