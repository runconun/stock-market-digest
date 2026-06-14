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
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `You are a professional financial translator specializing in Thai capital markets.

Your task:
1. Search for Thai stock market closing news today using keyword "ภาวะตลาดหุ้นไทย" from ryt9.com or Thai financial news sources published after 17:00 Bangkok time today.
2. Extract SET Index closing data and market commentary.
3. Translate into a polished English digest in EXACTLY this format — three plain paragraphs, no headers, no bullets, no markdown:

Paragraph 1: "The SET Index closed on [Day Month, Year] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."

Paragraph 2: What drove the market that day (sectors, sentiment, global cues).

Paragraph 3: Forward-looking commentary — sector rotation, risks, themes to watch.

Style: formal yet accessible, spell out abbreviations first use e.g. artificial intelligence (AI), use THB for Baht, 2–4 sentences per paragraph.

If no closing data found for today, respond with exactly the word: NO_DATA_TODAY`,
        messages: [
          {
            role: "user",
            content: `Today is ${date} (Bangkok time). Search for today's Thai stock market closing news and produce the English digest.`
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

    const text = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

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
