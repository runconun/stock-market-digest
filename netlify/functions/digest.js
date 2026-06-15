const cache = {};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  try {
    const { date } = JSON.parse(event.body);
    const cacheKey = `digest-${date.replace(/\s+/g, "-")}`;

    // Check in-memory cache
    if (cache[cacheKey]) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cache[cacheKey], fromCache: true })
      };
    }

    // Step 1: Fetch ryt9.com/stock-latest directly
    const ryt9Res = await fetch("https://www.ryt9.com/stock-latest", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const ryt9Html = await ryt9Res.text();

    // Step 2: Send HTML to Claude to find the article URL and extract content
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 1,
          allowed_domains: ["ryt9.com"]
        }],
        system: `You are a professional financial translator specializing in Thai capital markets.

CRITICAL OUTPUT RULES:
- Output ONLY three plain paragraphs. No preamble, no "I found...", no explanation.
- Start immediately with "The SET Index closed on..."
- Three paragraphs separated by a blank line. No headers, no bullets, no markdown.

Paragraph 1: "The SET Index closed on [Day Month, Year] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."
Paragraph 2: What drove the market that day (sectors, sentiment, global cues). 2–4 sentences.
Paragraph 3: Forward-looking commentary — sector rotation, risks, themes to watch. 2–4 sentences.

Style: formal yet accessible, spell out abbreviations on first use e.g. artificial intelligence (AI), use THB for Baht.

If no closing data found for ${date}, output exactly: NO_DATA_TODAY`,
        messages: [{
          role: "user",
          content: `Here is the HTML from ryt9.com/stock-latest page. Find the article about "ภาวะตลาดหุ้นไทย" published on ${date}, then fetch that article URL from ryt9.com and translate it into the English digest.

HTML content:
${ryt9Html.slice(0, 8000)}`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || "Anthropic API error" }) };
    }

    const rawText = data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    const setIdx = rawText.indexOf("The SET Index");
    const text = setIdx > 0 ? rawText.slice(setIdx).trim() : rawText;

    // Save to in-memory cache
    if (text !== "NO_DATA_TODAY" && !text.includes("NO_DATA_TODAY")) {
      cache[cacheKey] = text;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, fromCache: false })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
