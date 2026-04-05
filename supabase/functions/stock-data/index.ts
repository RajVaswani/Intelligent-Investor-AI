const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    let symbol: string | null = null
    let range = '1d'
    let interval = '5m'

    if (req.method === 'GET') {
      symbol = url.searchParams.get('symbol')
      range = url.searchParams.get('range') || '1d'
      interval = url.searchParams.get('interval') || '5m'
    } else {
      const body = await req.json()
      symbol = body.symbol
      range = body.range || '1d'
      interval = body.interval || '5m'
    }

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching stock data for ${symbol}, range=${range}, interval=${interval}`)

    // Fetch chart data from Yahoo Finance
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`
    const chartRes = await fetch(chartUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!chartRes.ok) {
      const errText = await chartRes.text()
      console.error('Yahoo Finance error:', errText)
      return new Response(
        JSON.stringify({ success: false, error: `Yahoo Finance returned ${chartRes.status}` }),
        { status: chartRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const chartData = await chartRes.json()
    const result = chartData?.chart?.result?.[0]

    if (!result) {
      return new Response(
        JSON.stringify({ success: false, error: 'No data returned' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const timestamps = result.timestamp || []
    const quote = result.indicators?.quote?.[0] || {}
    const meta = result.meta || {}

    const candles = timestamps.map((ts: number, i: number) => ({
      time: ts * 1000,
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      close: quote.close?.[i] ?? null,
      volume: quote.volume?.[i] ?? null,
    })).filter((c: any) => c.close !== null)

    const response = {
      success: true,
      data: {
        symbol: meta.symbol,
        currency: meta.currency,
        exchange: meta.exchangeName,
        regularMarketPrice: meta.regularMarketPrice,
        previousClose: meta.previousClose || meta.chartPreviousClose,
        regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
        candles,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
