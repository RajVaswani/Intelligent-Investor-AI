const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

async function firecrawlSearch(apiKey: string, query: string, limit: number): Promise<{ text: string; results: any[] }> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    })
    const json = await res.json()
    const results = json?.data || json?.results || []
    const text = results.map((r: any) => `[${r.title}] (${r.url}) ${r.description || ''}`).join('\n\n')
    return { text: text.substring(0, 3500), results }
  } catch (e) {
    console.error(`Search failed for: ${query}`, e)
    return { text: '', results: [] }
  }
}

function extractCitations(results: any[]): Array<{ title: string; url: string; source: string }> {
  return results
    .filter((r: any) => r.url && r.title)
    .map((r: any) => {
      try {
        const domain = new URL(r.url).hostname.replace('www.', '')
        return { title: r.title, url: r.url, source: domain }
      } catch { return null }
    })
    .filter(Boolean) as any[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbol, name, sector, website, etf } = await req.json()

    if (!symbol || !name || !etf) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!firecrawlKey || !lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const region = etf === 'nifty50' ? 'India' : 'United States'
    const currency = etf === 'nifty50' ? 'INR' : 'USD'
    console.log(`Full macro+micro analysis for ${symbol} (${name})...`)

    const citations: Array<{ title: string; url: string; source: string }> = []

    // Step 1: Scrape company website
    let websiteData = ''
    if (website) {
      try {
        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: website, formats: ['markdown'], onlyMainContent: true }),
        })
        const scrapeJson = await scrapeRes.json()
        websiteData = (scrapeJson?.data?.markdown || scrapeJson?.markdown || 'No data').substring(0, 4000)
        citations.push({ title: `${name} Official Website`, url: website, source: 'Company Website' })
      } catch (e) {
        console.error('Website scrape failed:', e)
        websiteData = 'Failed to scrape'
      }
    } else {
      websiteData = 'No company website provided'
    }

    // Step 2-8: Parallel searches — micro AND macro
    const [
      newsSearch,
      financialSearch,
      reportSearch,
      geopoliticalSearch,
      controversySearch,
      macroEconSearch,
      sectorSearch,
      regionalSearch,
    ] = await Promise.all([
      // MICRO
      firecrawlSearch(firecrawlKey, `${name} ${symbol} quarterly results earnings financial performance 2025 2026`, 8),
      firecrawlSearch(firecrawlKey, `${name} stock analysis outlook site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR site:moneycontrol.com`, 5),
      firecrawlSearch(firecrawlKey, `${name} annual report investor presentation Q4 Q1 2025 2026 revenue profit margin`, 4),
      // MACRO
      firecrawlSearch(firecrawlKey, `${sector} sector ${region} geopolitical risk war sanctions trade policy tariff impact 2025 2026`, 5),
      firecrawlSearch(firecrawlKey, `${name} ${symbol} scandal controversy scam bribe corruption lawsuit fraud investigation legal`, 5),
      firecrawlSearch(firecrawlKey, `${region} economy interest rates inflation GDP currency ${currency} central bank monetary policy impact stock market 2026`, 5),
      firecrawlSearch(firecrawlKey, `${sector} sector outlook headwinds tailwinds disruption AI regulation competition ${region} 2026`, 4),
      firecrawlSearch(firecrawlKey, `${name} ${symbol} insider trading fake news media manipulation pump dump retail institutional sentiment ${region}`, 4),
    ])

    // Collect all citations
    ;[newsSearch, financialSearch, reportSearch, geopoliticalSearch, controversySearch, macroEconSearch, sectorSearch, regionalSearch]
      .forEach(s => citations.push(...extractCitations(s.results)))

    // Step 9: AI Analysis with comprehensive prompt
    const aiPrompt = `You are a senior equity research analyst AND geopolitical risk analyst at a top global investment bank. Provide an EXTREMELY comprehensive analysis covering BOTH micro fundamentals AND macro forces.

Company: ${name} (${symbol})
Sector: ${sector}
Region: ${region} (${currency})
ETF: ${etf === 'nifty50' ? 'Nifty 50 (India)' : 'S&P 500 (US)'}

=== COMPANY WEBSITE DATA ===
${websiteData}

=== RECENT NEWS & QUARTERLY RESULTS ===
${newsSearch.text}

=== FINANCIAL NEWS (Bloomberg/Reuters/CNBC) ===
${financialSearch.text}

=== ANNUAL/QUARTERLY REPORTS ===
${reportSearch.text}

=== GEOPOLITICAL & TRADE POLICY CONTEXT ===
${geopoliticalSearch.text}

=== CONTROVERSIES, SCAMS, LEGAL ISSUES ===
${controversySearch.text}

=== MACRO-ECONOMIC FACTORS ===
${macroEconSearch.text}

=== SECTOR TAILWINDS & HEADWINDS ===
${sectorSearch.text}

=== MEDIA SENTIMENT & MANIPULATION SIGNALS ===
${regionalSearch.text}

Respond with this JSON structure ONLY:
{
  "overallScore": <number 0-100>,
  "sentiment": "<bullish|bearish|neutral>",
  "summary": "<4-5 sentence executive summary covering BOTH company fundamentals AND macro environment with specific numbers>",

  "websiteInsights": "<3-4 sentences on company digital presence, products, strategy from website>",
  "financialHighlights": "<5-6 sentences with specific revenue, profit, margin, growth numbers from quarterly/annual reports>",
  "newsDigest": "<5-6 sentences on all recent news, analyst opinions, market reactions, upgrades/downgrades>",
  "detailedAnalysis": "<10-12 sentences: valuation, growth drivers, competitive moat, market positioning, capital allocation, sector trends>",
  "competitivePosition": "<5-6 sentences on competitive advantages, market share, peer comparison, barriers to entry, disruption threats>",
  "managementOutlook": "<4-5 sentences on management quality, strategic direction, guidance, capital deployment, track record>",

  "geopoliticalAnalysis": "<6-8 sentences: how current wars, sanctions, trade policies, tariffs, diplomatic tensions affect this company and sector. Be specific about which geopolitical events matter and quantify impact where possible>",
  "controversyScanner": "<6-8 sentences: any scandals, scams, bribes, corruption cases, lawsuits, fraud investigations, murders/crimes linked to management, regulatory penalties, whistleblower complaints. If none found, explain the company's governance track record. Be brutally honest>",
  "macroEconomicFactors": "<6-8 sentences: how interest rates, inflation, GDP growth, currency movements, central bank policy, government spending affect this stock. Include specific numbers like rate levels, inflation %, GDP growth %>",
  "sectorTailwindsHeadwinds": "<5-6 sentences: industry-level forces - AI disruption, regulation changes, supply chain shifts, demographic trends, ESG pressures, technology obsolescence>",
  "regionalSentiment": "<5-6 sentences: region-specific buy/sell dynamics - retail vs institutional flows, FII/DII activity (for India), political climate impact on markets, election cycle effects, cultural factors driving stock price>",
  "mediaManipulationCheck": "<5-6 sentences: assessment of fake news risk, social media pump-and-dump signals, media bias in coverage, paid news vs genuine analysis, anomalous trading patterns suggesting manipulation>",

  "strengths": ["<strength 1 with data>", "<strength 2>", "<strength 3>", "<strength 4>", "<strength 5>", "<strength 6>"],
  "risks": ["<risk 1 with data>", "<risk 2>", "<risk 3>", "<risk 4>", "<risk 5>", "<risk 6>"],
  "priceTarget1w": <predicted price 1 week>,
  "priceTarget1m": <predicted price 1 month>,
  "priceTarget3m": <predicted price 3 months>,
  "priceTarget1y": <predicted price 1 year>,
  "recommendation": "<buy|hold|sell>",
  "confidenceScore": <0-100>,
  "predictionReasoning": "<6-8 sentences: explain prediction rationale incorporating BOTH micro fundamentals AND macro forces. Cite specific catalysts, risks, valuation metrics, geopolitical factors, and macro trends that drive the price targets>"
}`

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a senior equity research and geopolitical risk analyst. Respond ONLY with valid JSON. No markdown, no code blocks. Be extremely detailed, cite specific numbers, and be brutally honest about risks including controversies.' },
          { role: 'user', content: aiPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('AI API error:', errText)
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limited — please try again in a minute' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: false, error: `AI analysis failed: ${aiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const aiJson = await aiRes.json()
    const analysisText = aiJson?.choices?.[0]?.message?.content || '{}'
    let analysis
    try {
      analysis = JSON.parse(analysisText)
    } catch {
      console.error('Failed to parse AI response:', analysisText)
      return new Response(JSON.stringify({ success: false, error: 'Failed to parse AI analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const uniqueCitations = citations.filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i)

    // Store in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: dbError } = await supabase
      .from('stock_analyses')
      .upsert({
        symbol, etf, company_name: name, sector,
        overall_score: analysis.overallScore || 50,
        sentiment: analysis.sentiment || 'neutral',
        summary: analysis.summary || '',
        website_insights: analysis.websiteInsights || '',
        financial_highlights: analysis.financialHighlights || '',
        news_digest: analysis.newsDigest || '',
        strengths: analysis.strengths || [],
        risks: analysis.risks || [],
        price_target_1w: analysis.priceTarget1w || null,
        price_target_1m: analysis.priceTarget1m || null,
        price_target_3m: analysis.priceTarget3m || null,
        price_target_1y: analysis.priceTarget1y || null,
        recommendation: analysis.recommendation || null,
        confidence_score: analysis.confidenceScore || null,
        prediction_reasoning: analysis.predictionReasoning || null,
        geopolitical_analysis: analysis.geopoliticalAnalysis || null,
        controversy_scanner: analysis.controversyScanner || null,
        macro_economic_factors: analysis.macroEconomicFactors || null,
        sector_tailwinds_headwinds: analysis.sectorTailwindsHeadwinds || null,
        regional_sentiment: analysis.regionalSentiment || null,
        media_manipulation_check: analysis.mediaManipulationCheck || null,
        raw_scraped_data: {
          detailedAnalysis: analysis.detailedAnalysis || '',
          competitivePosition: analysis.competitivePosition || '',
          managementOutlook: analysis.managementOutlook || '',
          citations: uniqueCitations,
        },
      }, { onConflict: 'symbol,etf' })

    if (dbError) console.error('DB error:', dbError)

    return new Response(
      JSON.stringify({
        success: true,
        data: { ...analysis, citations: uniqueCitations, symbol, etf, company_name: name, sector, lastUpdated: new Date().toISOString() },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})