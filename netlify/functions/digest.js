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

    // Step 1: Fetch ryt9 tag page for ภาวะตลาดหุ้นไทย directly
    const tagUrl = "https://www.ryt9.com/tag/%E0%B8%A0%E0%B8%B2%E0%B8%A7%E0%B8%B0%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%AB%E0%B8%B8%E0%B9%89%E0%B8%99%E0%B9%84%E0%B8%97%E0%B8%A2:";
    const listRes = await fetch(tagUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const listHtml = await listRes.text();

    // Step 2: Extract first article link from tag page
    const allLinks = [];
    const patterns = [
      /href="(https?:\/\/www\.ryt9\.com\/s\/[^"]+)"/gi,
      /href="(\/s\/[^"]+)"/gi
    ];

    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(listHtml)) !== null) {
        const url = m[1].startsWith("http") ? m[1] : "https://www.ryt9.com" + m[1];
        if (!allLinks.includes(url)) allLinks.push(url);
      }
      if (allLinks.length > 0) break;
    }

    let articleUrl = allLinks.length > 0 ? allLinks[0] : null;

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

You will receive HTML from a Thai financial news article. Translate it DIRECTLY into an English digest — word for word from the article. Do NOT summarize, generalize, or add anything not in the article.

CRITICAL OUTPUT RULES:
- Output ONLY three plain paragraphs. No preamble. No "I found...". No explanation before or after.
- Start immediately with "The SET Index closed on..."
- Three paragraphs separated by a blank line. No headers, no bullets, no markdown.

Paragraph 1 — translate directly from article:
"The SET Index closed on [extract actual date from article e.g. Tuesday, 16 June 2026] at [price] points, [up/down] [change] points ([+/-percentage]%), with a trading value of approximately THB [value] million."

Paragraph 2 — translate the analyst quote DIRECTLY and COMPLETELY but do NOT include the analyst's name or their title/firm. Start directly with "The Thai stock market..." or the market commentary itself. Include: sector names, stock names, specific reasons, numbers mentioned.

Paragraph 3 — translate the outlook section DIRECTLY from the article. Include: specific events to watch, support/resistance levels, Fed meeting details, named persons, probability figures — exactly as written in the article.

Style rules:
- Spell out Thai abbreviations on first use e.g. Federal Reserve (Fed)
- Use THB for Baht
- Keep stock ticker names as-is (DELTA, KBANK etc.)
- Translate "Sector Rotation", "Laggard", "Sell on Fact" as-is (these are market terms)

If no closing data found in article, output exactly: NO_DATA_TODAY`,
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
