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

    if (cache[cacheKey]) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cache[cacheKey], fromCache: true })
      };
    }

    // Step 1: Fetch ryt9 stock-latest page
    const listRes = await fetch("https://www.ryt9.com/stock-latest", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const listHtml = await listRes.text();

    // Step 2: Extract link containing "ภาวะตลาดหุ้นไทย"
    const linkRegex = /href="(https?:\/\/www\.ryt9\.com\/s\/[^"]+)"[^>]*>[^<]*ภาวะตลาดหุ้นไทย/gi;
    const altRegex = /href="(\/s\/[^"]+)"[^>]*>[^<]*ภาวะตลาดหุ้นไทย/gi;

    let articleUrl = null;
    let match = linkRegex.exec(listHtml);
    if (match) {
      articleUrl = match[1];
    } else {
      match = altRegex.exec(listHtml);
      if (match) articleUrl = "https://www.ryt9.com" + match[1];
    }

    // Step 3: If not found in list, try tag page
    if (!articleUrl) {
      const tagRes = await fetch("https://www.ryt9.com/tag/ภาวะตลาดหุ้นไทย:", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      const tagHtml = await tagRes.text();
      const tagRegex = /href="(https?:\/\/www\.ryt9\.com\/s\/[^"]+)"/gi;
      match = tagRegex.exec(tagHtml);
      if (match) articleUrl = match[1];
    }

    if (!articleUrl) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "NO_DATA_TODAY", fromCache: false })
      };
    }

    // Step 4: Fetch the article
    const articleRes = await fetch(articleUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const articleHtml = await articleRes.text();

    // Step 5: Send article to Claude for translation only (no search needed)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: `You are a professional financial translator specializing in Thai capital markets.

You will receive HTML from a Thai financial news article. Extract the SET Index closing data and market commentary, then translate into an English digest.

CRITICAL OUTPUT RULES:
- Output ONLY three plain paragraphs. No preamble, no explanation.
- Start immediately with "The SET Index closed on..."
- Three paragraphs separated by a blank line. No headers, no bullets, no markdown.

Paragraph 1: "The SET Index closed on [Day Month, Year] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."
Paragraph 2: What drove the market that day. 2–4 sentences.
Paragraph 3: Forward-looking commentary. 2–4 sentences.

Style: formal yet accessible, spell out abbreviations on first use, use THB for Baht.
If no relevant data found, output exactly: NO_DATA_TODAY`,
        messages: [{
          role: "user",
          content: `Translate this Thai stock market article into the English digest format:\n\n${articleHtml.slice(0, 6000)}`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || "API error" }) };
    }

    const rawText = data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    const setIdx = rawText.indexOf("The SET Index");
    const text = setIdx > 0 ? rawText.slice(setIdx).trim() : rawText;

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
