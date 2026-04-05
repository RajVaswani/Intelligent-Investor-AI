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

  if (error) {
    throw new Error(error.message || "Analysis failed");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Analysis returned no data");
  }

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
    strengths: d.strengths || [],
    risks: d.risks || [],
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

  return data.map((row: any) => ({
    id: row.id,
    company: {
      symbol: row.symbol,
      name: row.company_name,
      sector: row.sector,
      website: "",
      etf: row.etf,
    },
    overallScore: row.overall_score,
    sentiment: row.sentiment,
    summary: row.summary,
    websiteInsights: row.website_insights || "",
    financialHighlights: row.financial_highlights || "",
    newsDigest: row.news_digest || "",
    strengths: row.strengths || [],
    risks: row.risks || [],
    lastUpdated: row.updated_at,
  }));
}
