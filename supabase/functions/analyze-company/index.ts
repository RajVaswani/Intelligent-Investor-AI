const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbol, name, sector, website, etf } = await req.json()

    if (!symbol || !name || !website || !etf) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Analyzing ${symbol} (${name})...`)

    // Collect all citations
    const citations: Array<{ title: string; url: string; source: string }> = []

    // Step 1: Scrape company website
    let websiteData = ''
    try {
      const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: website, formats: ['markdown'], onlyMainContent: true }),
      })
      const scrapeJson = await scrapeRes.json()
      websiteData = scrapeJson?.data?.markdown || scrapeJson?.markdown || 'No data scraped'
      websiteData = websiteData.substring(0, 4000)
      citations.push({ title: `${name} Official Website`, url: website, source: 'Company Website' })
    } catch (e) {
      console.error('Website scrape failed:', e)
      websiteData = 'Failed to scrape website'
    }

    // Step 2: Search for news and quarterly reports
    let newsData = ''
    let newsResults: any[] = []
    try {
      const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${name} ${symbol} quarterly results earnings financial performance 2025 2026`,
          limit: 8,
          tbs: 'qdr:m',
        }),
      })
      const searchJson = await searchRes.json()
      newsResults = searchJson?.data || searchJson?.results || []
      newsData = newsResults.map((r: any) => `[${r.title}] (${r.url}) ${r.description || ''}`).join('\n\n')
      newsData = newsData.substring(0, 4000)
      newsResults.forEach((r: any) => {
        if (r.url && r.title) {
          const domain = new URL(r.url).hostname.replace('www.', '')
          citations.push({ title: r.title, url: r.url, source: domain })
        }
      })
    } catch (e) {
      console.error('News search failed:', e)
      newsData = 'Failed to fetch news'
    }

    // Step 3: Search Bloomberg/Reuters/CNBC
    let financialNews = ''
    try {
      const finRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${name} stock analysis outlook earnings site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR site:moneycontrol.com`,
          limit: 5,
        }),
      })
      const finJson = await finRes.json()
      const finResults = finJson?.data || finJson?.results || []
      financialNews = finResults.map((r: any) => `[${r.title}] (${r.url}) ${r.description || ''}`).join('\n\n')
      financialNews = financialNews.substring(0, 3000)
      finResults.forEach((r: any) => {
        if (r.url && r.title) {
          const domain = new URL(r.url).hostname.replace('www.', '')
          citations.push({ title: r.title, url: r.url, source: domain })
        }
      })
    } catch (e) {
      console.error('Financial news search failed:', e)
      financialNews = 'Failed to fetch financial news'
    }

    // Step 4: Search for annual/quarterly reports
    let reportData = ''
    try {
      const reportRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${name} annual report investor presentation Q4 Q1 2025 2026 revenue profit margin`,
          limit: 4,
        }),
      })
      const reportJson = await reportRes.json()
      const reportResults = reportJson?.data || reportJson?.results || []
      reportData = reportResults.map((r: any) => `[${r.title}] (${r.url}) ${r.description || ''}`).join('\n\n')
      reportData = reportData.substring(0, 2000)
      reportResults.forEach((r: any) => {
        if (r.url && r.title) {
          const domain = new URL(r.url).hostname.replace('www.', '')
          citations.push({ title: r.title, url: r.url, source: domain })
        }
      })
    } catch (e) {
      console.error('Report search failed:', e)
      reportData = 'No report data found'
    }

    // Step 5: AI Analysis
    const aiPrompt = `You are a senior equity research analyst at a top investment bank. Provide an extremely detailed and comprehensive analysis.

Company: ${name} (${symbol})
Sector: ${sector}
ETF: ${etf === 'nifty50' ? 'Nifty 50 (India)' : 'S&P 500 (US)'}

=== COMPANY WEBSITE DATA ===
${websiteData}

=== RECENT NEWS & QUARTERLY RESULTS ===
${newsData}

=== FINANCIAL NEWS (Bloomberg/Reuters/CNBC) ===
${financialNews}

=== ANNUAL/QUARTERLY REPORTS ===
${reportData}

Respond with this JSON structure ONLY:
{
  "overallScore": <number 0-100, be precise based on evidence>,
  "sentiment": "<bullish|bearish|neutral>",
  "summary": "<3-4 sentence executive summary with specific numbers and data points>",
  "websiteInsights": "<detailed analysis of company's digital presence, products, strategy based on their website, 3-4 sentences>",
  "financialHighlights": "<detailed financial analysis with specific revenue, profit, margin numbers from quarterly reports, 4-5 sentences>",
  "newsDigest": "<comprehensive summary of all recent news, analyst opinions, market reactions, 4-5 sentences>",
  "detailedAnalysis": "<8-10 sentence deep-dive covering valuation, growth drivers, competitive moat, market positioning, capital allocation, sector trends>",
  "competitivePosition": "<4-5 sentences on competitive advantages, market share, peer comparison, barriers to entry>",
  "managementOutlook": "<3-4 sentences on management quality, strategic direction, guidance, capital deployment>",
  "strengths": ["<specific strength with data>", "<strength 2>", "<strength 3>", "<strength 4>", "<strength 5>"],
  "risks": ["<specific risk with context>", "<risk 2>", "<risk 3>", "<risk 4>", "<risk 5>"]
}`

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a senior equity research analyst. Respond ONLY with valid JSON. No markdown, no code blocks. Be extremely detailed and cite specific numbers.' },
          { role: 'user', content: aiPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('AI API error:', errText)
      return new Response(
        JSON.stringify({ success: false, error: `AI analysis failed: ${aiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiJson = await aiRes.json()
    const analysisText = aiJson?.choices?.[0]?.message?.content || '{}'
    let analysis
    try {
      analysis = JSON.parse(analysisText)
    } catch {
      console.error('Failed to parse AI response:', analysisText)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse AI analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Deduplicate citations
    const uniqueCitations = citations.filter((c, i, arr) =>
      arr.findIndex((x) => x.url === c.url) === i
    )

    // Store in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: dbError } = await supabase
      .from('stock_analyses')
      .upsert({
        symbol,
        etf,
        company_name: name,
        sector,
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
        raw_scraped_data: {
          detailedAnalysis: analysis.detailedAnalysis || '',
          competitivePosition: analysis.competitivePosition || '',
          managementOutlook: analysis.managementOutlook || '',
          citations: uniqueCitations,
        },
      }, { onConflict: 'symbol,etf' })

    if (dbError) {
      console.error('DB error:', dbError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...analysis,
          citations: uniqueCitations,
          symbol,
          etf,
          company_name: name,
          sector,
          lastUpdated: new Date().toISOString(),
        },
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
