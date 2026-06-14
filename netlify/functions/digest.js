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

Your task:
1. Search ryt9.com ONLY for the article titled "ภาวะตลาดหุ้นไทย" published on ${date}. Use exactly this search query: site:ryt9.com ภาวะตลาดหุ้นไทย ${date}
2. Extract SET Index closing data and market commentary from that article.
3. Translate into a polished English digest.

CRITICAL OUTPUT RULES — strictly follow these:
- Output ONLY the three paragraphs below. No preamble, no "I found...", no "Based on...", no explanation before or after.
- Start your response immediately with "The SET Index closed on..."
- Three plain paragraphs separated by a blank line. No headers, no bullets, no markdown.

Paragraph 1: "The SET Index closed on [Day Month, Year] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."
Paragraph 2: What drove the market that day (sectors, sentiment, global cues). 2–4 sentences.
Paragraph 3: Forward-looking commentary — sector rotation, risks, themes to watch. 2–4 sentences.

Style: formal yet accessible, spell out abbreviations on first use e.g. artificial intelligence (AI), use THB for Baht.

If no closing article found, output exactly: NO_DATA_TODAY`,
        messages: [
          {
            role: "user",
            content: `Search ryt9.com for the Thai stock market closing news published on ${date} and produce the English digest.`
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || "Anthropic API error" })
      };
    }

    const rawText = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    // Strip any preamble before "The SET Index"
    const setIndex = rawText.indexOf("The SET Index");
    const text = setIndex > 0 ? rawText.slice(setIndex).trim() : rawText;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
