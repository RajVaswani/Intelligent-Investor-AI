const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { symbol, type } = body // type: 'chain' | 'intraday'

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Helper: fetch chart data from Yahoo and parse candles
    async function fetchYahooChart(sym: string, range: string, interval: string) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) return { error: res.status }
      const chartData = await res.json()
      const result = chartData?.chart?.result?.[0]
      if (!result) return { error: 404 }
      return { result }
    }

    function parseCandles(result: any) {
      const timestamps = result.timestamp || []
      const quote = result.indicators?.quote?.[0] || {}
      const candles = timestamps.map((ts: number, i: number) => ({
        time: ts * 1000,
        open: quote.open?.[i] ?? null,
        high: quote.high?.[i] ?? null,
        low: quote.low?.[i] ?? null,
        close: quote.close?.[i] ?? null,
        volume: quote.volume?.[i] ?? null,
      })).filter((c: any) => c.close !== null)
      return candles
    }

    function addVwap(candles: any[]) {
      let cumulativeTPV = 0
      let cumulativeVolume = 0
      // Reset VWAP daily
      let lastDay = -1
      return candles.map((c: any) => {
        const day = new Date(c.time).getDate()
        if (day !== lastDay) {
          cumulativeTPV = 0
          cumulativeVolume = 0
          lastDay = day
        }
        const tp = (c.high + c.low + c.close) / 3
        cumulativeTPV += tp * c.volume
        cumulativeVolume += c.volume
        return { ...c, vwap: cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : tp }
      })
    }

    // Historical: 60 days of data for recursive learning (2m intervals, Yahoo max for 60d)
    if (type === 'historical') {
      // Yahoo limits: 1m=7d, 2m=60d, 5m=60d
      // Fetch 7d@1m + 60d@5m for comprehensive coverage
      const [res1m, res5m] = await Promise.all([
        fetchYahooChart(symbol, '7d', '2m'),
        fetchYahooChart(symbol, '60d', '5m'),
      ])

      const candles1m = res1m.result ? addVwap(parseCandles(res1m.result)) : []
      const candles5m = res5m.result ? addVwap(parseCandles(res5m.result)) : []
      const meta = res1m.result?.meta || res5m.result?.meta || {}

      // Merge: use 5m for older data, 2m for recent 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const olderCandles = candles5m.filter((c: any) => c.time < sevenDaysAgo)
      const merged = [...olderCandles, ...candles1m]

      return new Response(JSON.stringify({
        success: true,
        data: {
          symbol: meta.symbol || symbol,
          currency: meta.currency,
          regularMarketPrice: meta.regularMarketPrice,
          candles: merged,
          totalCandles: merged.length,
          ranges: { '2m_7d': candles1m.length, '5m_60d': candles5m.length },
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (type === 'intraday') {
      // Fetch 1-minute intraday data for pattern analysis
      const chartResult = await fetchYahooChart(symbol, '1d', '1m')
      if (chartResult.error) {
        return new Response(
          JSON.stringify({ success: false, error: `Yahoo returned ${chartResult.error}` }),
          { status: typeof chartResult.error === 'number' ? chartResult.error : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const result = chartResult.result

      const candles = parseCandles(result)
      const meta = result.meta || {}

      // Calculate VWAP
      const withVwap = addVwap(candles)

      // Support/Resistance from pivots
      const closes = candles.map((c: any) => c.close)
      const highs = candles.map((c: any) => c.high)
      const lows = candles.map((c: any) => c.low)
      const dayHigh = Math.max(...highs)
      const dayLow = Math.min(...lows)
      const lastClose = closes[closes.length - 1]
      const pivot = (dayHigh + dayLow + lastClose) / 3
      const r1 = 2 * pivot - dayLow
      const s1 = 2 * pivot - dayHigh
      const r2 = pivot + (dayHigh - dayLow)
      const s2 = pivot - (dayHigh - dayLow)

      // Volume profile - group by price levels
      const priceRange = dayHigh - dayLow
      const bucketSize = priceRange / 20 || 0.01
      const volumeProfile: Record<string, number> = {}
      candles.forEach((c: any) => {
        const bucket = Math.floor((c.close - dayLow) / bucketSize) * bucketSize + dayLow
        const key = bucket.toFixed(2)
        volumeProfile[key] = (volumeProfile[key] || 0) + c.volume
      })
      const volumeProfileArr = Object.entries(volumeProfile).map(([price, vol]) => ({
        price: parseFloat(price),
        volume: vol as number,
      })).sort((a, b) => a.price - b.price)

      return new Response(JSON.stringify({
        success: true,
        data: {
          symbol: meta.symbol,
          currency: meta.currency,
          regularMarketPrice: meta.regularMarketPrice,
          previousClose: meta.previousClose || meta.chartPreviousClose,
          candles: withVwap,
          support: { s1, s2 },
          resistance: { r1, r2 },
          pivot,
          volumeProfile: volumeProfileArr,
          dayHigh,
          dayLow,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Options chain
    const optUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`
    const optRes = await fetch(optUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })

    if (!optRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Yahoo options returned ${optRes.status}` }),
        { status: optRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const optData = await optRes.json()
    const optResult = optData?.optionChain?.result?.[0]
    if (!optResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'No options data available for this symbol' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const quote = optResult.quote || {}
    const expirations = (optResult.expirationDates || []).map((d: number) => d * 1000)
    const strikes = optResult.strikes || []

    const calls = (optResult.options?.[0]?.calls || []).map((o: any) => ({
      strike: o.strike,
      lastPrice: o.lastPrice,
      bid: o.bid,
      ask: o.ask,
      change: o.change,
      percentChange: o.percentChange,
      volume: o.volume || 0,
      openInterest: o.openInterest || 0,
      impliedVolatility: o.impliedVolatility,
      inTheMoney: o.inTheMoney,
      expiration: o.expiration ? o.expiration * 1000 : null,
    }))

    const puts = (optResult.options?.[0]?.puts || []).map((o: any) => ({
      strike: o.strike,
      lastPrice: o.lastPrice,
      bid: o.bid,
      ask: o.ask,
      change: o.change,
      percentChange: o.percentChange,
      volume: o.volume || 0,
      openInterest: o.openInterest || 0,
      impliedVolatility: o.impliedVolatility,
      inTheMoney: o.inTheMoney,
      expiration: o.expiration ? o.expiration * 1000 : null,
    }))

    return new Response(JSON.stringify({
      success: true,
      data: {
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice,
        expirations,
        strikes,
        calls,
        puts,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Options data error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
