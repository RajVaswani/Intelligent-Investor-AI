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
      // Truncate to avoid token limits
      websiteData = websiteData.substring(0, 3000)
    } catch (e) {
      console.error('Website scrape failed:', e)
      websiteData = 'Failed to scrape website'
    }

    // Step 2: Search for news and quarterly reports
    let newsData = ''
    try {
      const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${name} ${symbol} quarterly results financial performance 2025 2026`,
          limit: 5,
          tbs: 'qdr:m',
        }),
      })
      const searchJson = await searchRes.json()
      const results = searchJson?.data || searchJson?.results || []
      newsData = results.map((r: any) => `[${r.title}] ${r.description || ''}`).join('\n\n')
      newsData = newsData.substring(0, 3000)
    } catch (e) {
      console.error('News search failed:', e)
      newsData = 'Failed to fetch news'
    }

    // Step 3: Search Bloomberg/Reuters specifically
    let financialNews = ''
    try {
      const finRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${name} stock analysis outlook site:bloomberg.com OR site:reuters.com OR site:cnbc.com`,
          limit: 3,
        }),
      })
      const finJson = await finRes.json()
      const finResults = finJson?.data || finJson?.results || []
      financialNews = finResults.map((r: any) => `[${r.title}] ${r.description || ''}`).join('\n\n')
      financialNews = financialNews.substring(0, 2000)
    } catch (e) {
      console.error('Financial news search failed:', e)
      financialNews = 'Failed to fetch financial news'
    }

    // Step 4: AI Analysis using Lovable AI Gateway
    const aiPrompt = `You are a senior equity research analyst. Analyze the following company and provide a structured assessment.

Company: ${name} (${symbol})
Sector: ${sector}
ETF: ${etf === 'nifty50' ? 'Nifty 50 (India)' : 'S&P 500 (US)'}

=== COMPANY WEBSITE DATA ===
${websiteData}

=== RECENT NEWS & QUARTERLY RESULTS ===
${newsData}

=== FINANCIAL NEWS (Bloomberg/Reuters/CNBC) ===
${financialNews}

Provide your analysis in the following JSON format ONLY (no other text):
{
  "overallScore": <number 0-100>,
  "sentiment": "<bullish|bearish|neutral>",
  "summary": "<2-3 sentence executive summary>",
  "websiteInsights": "<key insights from the company website>",
  "financialHighlights": "<key financial metrics and quarterly performance>",
  "newsDigest": "<summary of recent news sentiment and key developments>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>", "<strength 4>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>", "<risk 4>"]
}`

    const aiRes = await fetch('https://ai.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a financial analyst. Respond ONLY with valid JSON. No markdown, no code blocks.' },
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

    // Step 5: Store in database
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
        raw_scraped_data: { websiteData: websiteData.substring(0, 500), newsData: newsData.substring(0, 500) },
      }, { onConflict: 'symbol,etf' })

    if (dbError) {
      console.error('DB error:', dbError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...analysis,
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
