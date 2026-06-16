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

    // Step 2: Extract link containing "ภาวะตลาดหุ้นไทย" - prefer closing session (after 17:00)
    // Look for links with time indicators for closing session
    const allLinks = [];
    const linkPattern = /href="((?:https?:\/\/www\.ryt9\.com)?\/s\/[^"]+)"[^>]*>[\s\S]{0,200}?ภาวะตลาดหุ้นไทย/gi;
    let m;
    while ((m = linkPattern.exec(listHtml)) !== null) {
      const url = m[1].startsWith("http") ? m[1] : "https://www.ryt9.com" + m[1];
      allLinks.push(url);
    }

    // Also try simpler pattern
    if (allLinks.length === 0) {
      const simplePattern = /href="((?:https?:\/\/www\.ryt9\.com)?\/s\/iq[^"]+)"/gi;
      const textAround = listHtml.indexOf("ภาวะตลาดหุ้นไทย");
      if (textAround > -1) {
        const chunk = listHtml.slice(Math.max(0, textAround - 500), textAround + 100);
        const sm = simplePattern.exec(chunk);
        if (sm) allLinks.push(sm[1].startsWith("http") ? sm[1] : "https://www.ryt9.com" + sm[1]);
      }
    }

    let articleUrl = allLinks.length > 0 ? allLinks[0] : null;

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

You will receive HTML from a Thai financial news article about the Thai stock market closing. Translate the content directly into an English digest — do NOT summarize, paraphrase, or add your own commentary.

CRITICAL OUTPUT RULES:
- Output ONLY three plain paragraphs. No preamble, no "I found...", no explanation.
- Start immediately with "The SET Index closed on..."
- Three paragraphs separated by a blank line. No headers, no bullets, no markdown.
- Translate DIRECTLY from the article text. Do not add, infer, or generalize anything not explicitly stated.

Paragraph 1 (Data — translate directly): "The SET Index closed on [Day Month, Year] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."

Paragraph 2 (Market drivers — translate directly from analyst quotes and article body): Translate what the article explicitly states about WHY the market moved — exact analyst commentary, specific catalysts, sector rotation details, named sectors, geopolitical developments as written in the article.

Paragraph 3 (Outlook — translate directly from article): Translate what the article explicitly states about what to watch — specific events, Fed meeting, named persons, support/resistance levels, probability figures mentioned in the article.

Style: formal yet accessible, spell out abbreviations on first use e.g. Memorandum of Understanding (MOU), use THB for Baht.
NEVER make up or generalize — only translate what is explicitly in the article.
If no closing session data found, output exactly: NO_DATA_TODAY`,
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
