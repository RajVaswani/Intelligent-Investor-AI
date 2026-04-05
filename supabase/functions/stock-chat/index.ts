const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, stockContext } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!stockContext?.symbol) {
      return new Response(JSON.stringify({ error: 'Stock symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const systemPrompt = `You are a specialist financial analyst assistant focused EXCLUSIVELY on ${stockContext.symbol} (${stockContext.companyName}).

CONTEXT — Here is the current analysis data for this stock:
- Sector: ${stockContext.sector || 'Unknown'}
- Sentiment: ${stockContext.sentiment || 'Not analyzed'}
- Overall Score: ${stockContext.overallScore ?? 'N/A'}/100
- Recommendation: ${stockContext.recommendation || 'N/A'}
- Confidence: ${stockContext.confidenceScore ?? 'N/A'}%
- Summary: ${stockContext.summary || 'No analysis available yet'}
- Price Targets: 1W=${stockContext.priceTarget1w ?? 'N/A'}, 1M=${stockContext.priceTarget1m ?? 'N/A'}, 3M=${stockContext.priceTarget3m ?? 'N/A'}, 1Y=${stockContext.priceTarget1y ?? 'N/A'}
- Live Price: ${stockContext.livePrice ?? 'N/A'}
- Avg Cost: ${stockContext.avgCost ?? 'N/A'}, Qty: ${stockContext.quantity ?? 'N/A'}
- Strengths: ${stockContext.strengths || 'N/A'}
- Risks: ${stockContext.risks || 'N/A'}
- Financial Highlights: ${stockContext.financialHighlights || 'N/A'}
- News Digest: ${stockContext.newsDigest || 'N/A'}
- Macro Factors: ${stockContext.macroFactors || 'N/A'}
- Geopolitical Risk: ${stockContext.geopoliticalAnalysis || 'N/A'}

RULES:
1. ONLY answer questions about ${stockContext.symbol}. If the user asks about another stock, politely redirect.
2. If you spot inconsistencies or potential errors in the analysis data above, proactively mention them with clarifications.
3. Be concise, data-driven, and actionable. Use markdown formatting.
4. Always caveat that this is AI-generated analysis, not financial advice.
5. When the user asks about errors, review all the data points above and flag anything that looks incorrect, outdated, or inconsistent.`;

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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited. Please try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits exhausted. Please add funds.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('stock-chat error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
