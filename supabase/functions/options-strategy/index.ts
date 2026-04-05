const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { symbol, currentPrice, calls, puts, intraday } = await req.json()
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const systemPrompt = `You are an expert options trading strategist. Given market data, provide actionable options strategy recommendations.

Respond with a JSON object (no markdown) with this structure:
{
  "strategies": [
    {
      "name": "Strategy Name (e.g. Bull Call Spread)",
      "type": "bullish|bearish|neutral",
      "legs": [{"action":"BUY|SELL","type":"CALL|PUT","strike":number,"premium":number}],
      "maxProfit": "description",
      "maxLoss": "description",
      "breakeven": number,
      "confidence": 1-100,
      "reasoning": "why this strategy"
    }
  ],
  "marketOutlook": "brief outlook",
  "ivAnalysis": "implied volatility assessment",
  "keyLevels": {"support":number,"resistance":number},
  "riskWarning": "risk disclaimer"
}`

    const nearMoney = calls?.filter((c: any) => Math.abs(c.strike - currentPrice) / currentPrice < 0.05)?.slice(0, 5) || []
    const nearPuts = puts?.filter((p: any) => Math.abs(p.strike - currentPrice) / currentPrice < 0.05)?.slice(0, 5) || []

    const userPrompt = `Analyze ${symbol} trading at $${currentPrice}.

Near-the-money CALLS: ${JSON.stringify(nearMoney)}
Near-the-money PUTS: ${JSON.stringify(nearPuts)}
${intraday ? `Intraday - VWAP: $${intraday.vwap}, Support: $${intraday.s1}, Resistance: $${intraday.r1}, Day Range: $${intraday.dayLow}-$${intraday.dayHigh}` : ''}

Suggest 3-4 options strategies with different risk profiles.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const status = response.status
      if (status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded, try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`AI gateway error ${status}`)
    }

    const aiData = await response.json()
    const content = aiData.choices?.[0]?.message?.content || ''

    let parsed
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { strategies: [], marketOutlook: content, ivAnalysis: '', keyLevels: {}, riskWarning: 'Unable to parse structured response.' }
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Options strategy error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
