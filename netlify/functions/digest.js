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
