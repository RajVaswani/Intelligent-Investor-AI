const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FLEX_REQUEST_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest";
const FLEX_FETCH_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, queryId, userId } = await req.json();

    if (!token || !queryId || !userId) {
      return new Response(JSON.stringify({ success: false, error: "Missing token, queryId, or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Request the flex report
    const requestUrl = `${FLEX_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
    const requestRes = await fetch(requestUrl);
    const requestXml = await requestRes.text();

    // Parse reference code from XML response
    const refMatch = requestXml.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
    const statusMatch = requestXml.match(/<Status>(\w+)<\/Status>/);

    if (!refMatch || statusMatch?.[1] !== "Success") {
      const errorMatch = requestXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
      return new Response(JSON.stringify({
        success: false,
        error: errorMatch?.[1] || "Failed to request Flex report. Check your token and query ID.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referenceCode = refMatch[1];

    // Step 2: Wait briefly then fetch the report (IBKR needs a moment to generate)
    await new Promise((r) => setTimeout(r, 3000));

    let reportXml = "";
    let attempts = 0;
    while (attempts < 5) {
      const fetchUrl = `${FLEX_FETCH_URL}?q=${referenceCode}&t=${encodeURIComponent(token)}&v=3`;
      const fetchRes = await fetch(fetchUrl);
      reportXml = await fetchRes.text();

      // If still generating, wait and retry
      if (reportXml.includes("is being generated")) {
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      break;
    }

    if (reportXml.includes("is being generated")) {
      return new Response(JSON.stringify({
        success: false,
        error: "Report is still generating. Please try again in a moment.",
      }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Parse positions from XML
    const positions = parsePositions(reportXml);

    // Step 4: Upsert into user_portfolios
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    for (const pos of positions) {
      await supabase.from("user_portfolios").upsert({
        user_id: userId,
        symbol: pos.symbol,
        company_name: pos.description || pos.symbol,
        quantity: pos.quantity,
        avg_price: pos.costBasis,
        sector: pos.assetCategory || null,
        exchange: pos.listingExchange || null,
        currency: pos.currency || "USD",
      }, { onConflict: "user_id,symbol" });
    }

    return new Response(JSON.stringify({
      success: true,
      data: { positionsCount: positions.length, positions },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("IBKR Flex error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface ParsedPosition {
  symbol: string;
  description: string;
  quantity: number;
  costBasis: number;
  marketValue: number;
  currency: string;
  assetCategory: string;
  listingExchange: string;
}

function parsePositions(xml: string): ParsedPosition[] {
  const positions: ParsedPosition[] = [];

  // Match OpenPosition or Position elements
  const posRegex = /<(?:OpenPosition|Position)\s+([^>]+)\/>/g;
  let match;

  while ((match = posRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const get = (name: string) => {
      const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : "";
    };

    const qty = parseFloat(get("position") || get("quantity") || "0");
    if (qty === 0) continue;

    positions.push({
      symbol: get("symbol"),
      description: get("description"),
      quantity: Math.abs(qty),
      costBasis: parseFloat(get("costBasisPrice") || get("costBasis") || "0"),
      marketValue: parseFloat(get("markPrice") || get("marketValue") || "0"),
      currency: get("currency") || "USD",
      assetCategory: get("assetCategory") || get("putCall") || "",
      listingExchange: get("listingExchange") || "",
    });
  }

  return positions;
}
