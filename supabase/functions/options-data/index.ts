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

    if (type === 'intraday') {
      // Fetch 1-minute intraday data for pattern analysis
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=false`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Yahoo returned ${res.status}` }),
          { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const chartData = await res.json()
      const result = chartData?.chart?.result?.[0]
      if (!result) {
        return new Response(
          JSON.stringify({ success: false, error: 'No intraday data' }),
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

      // Calculate VWAP
      let cumulativeTPV = 0
      let cumulativeVolume = 0
      const withVwap = candles.map((c: any) => {
        const tp = (c.high + c.low + c.close) / 3
        cumulativeTPV += tp * c.volume
        cumulativeVolume += c.volume
        return { ...c, vwap: cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : tp }
      })

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
