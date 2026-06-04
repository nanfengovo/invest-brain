/**
 * Vercel Serverless Function — /api/summarize
 *
 * Uses Gemini to summarize a short title for information cards based on:
 * 1. Pasted text content
 * 2. URL page metadata (parsed inside the function)
 * 3. Base64 uploaded images
 */

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is not configured. Please add one in Vercel or locally in settings.' });
  }

  try {
    const { url, content, image, mimeType = 'image/png' } = req.body;

    if (!url && !content && !image) {
      return res.status(400).json({ error: 'Please provide either url, content, or image.' });
    }

    let summaryPromptText = '';
    const parts = [];

    // 1. If URL is provided, try parsing it
    if (url) {
      let pageDetails = '';
      try {
        console.log(`[Summarize API] Fetching metadata for URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000), // Timeout after 5s
        });

        if (response.ok) {
          const htmlText = await response.text();

          // Extract title tag
          const titleMatch = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const rawTitle = titleMatch ? titleMatch[1].trim() : '';

          // Extract og:title
          const ogTitleMatch = htmlText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                               htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
          const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : '';

          // Extract description
          const descMatch = htmlText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                            htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
          const desc = descMatch ? descMatch[1].trim() : '';

          pageDetails = `URL: ${url}\n网页原始标题: ${rawTitle}\n社交网络标题(og): ${ogTitle}\n描述信息: ${desc}`;
        } else {
          pageDetails = `URL: ${url}\n抓取网页失败，状态码: ${response.status}`;
        }
      } catch (e) {
        console.error(`[Summarize API] URL fetch error:`, e);
        pageDetails = `URL: ${url}\n抓取网页发生异常: ${e.message}`;
      }
      summaryPromptText += `【用户提供了来源链接信息】\n${pageDetails}\n\n`;
    }

    // 2. If text content is provided
    if (content) {
      summaryPromptText += `【用户提供了摘录/正文内容】\n${content}\n\n`;
    }

    // 3. Build instructions
    let instruction = '你是一个专业的投资情报阅读助手。请结合以上提供的信息（可能包含网页链接标题、描述、文章内容或图像内容），为这条情报归纳提取出一个非常精炼、易懂的中文卡片标题。\n\n规则：\n1. 标题必须非常简短，严格控制在 30 个字以内。\n2. 突出核心事件（如：公司、动作、财务数据或板块变化，例如：“特斯拉 Q1 交付量不及预期大跌” 或 “美联储降息50个基点汇率变动”）。\n3. 不要输出任何多余的废话、解释或 Markdown 格式，只输出提炼好的纯文字标题本身。';
    
    parts.push({ text: summaryPromptText + instruction });

    // 4. If image is provided
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
      parts.push({ text: '另外，参考上面这张图片的内容进行综合标题总结。' });
    }

    // Call Gemini API with fallbacks
    const summarizeModels = [
      'gemini-2.5-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
    ];

    let lastError = null;
    let success = false;
    let generatedTitle = '';

    for (const currentModel of summarizeModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
      console.log(`[Summarize API] Trying model: ${currentModel}`);
      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 100,
            },
          }),
        });

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          console.warn(`[Summarize API] Model ${currentModel} failed: ${errText}`);
          lastError = { status: geminiResponse.status, text: errText };
          continue; // Try next model
        }

        const data = await geminiResponse.json();
        generatedTitle = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        success = true;
        console.log(`[Summarize API] Successfully summarized with model: ${currentModel}`);
        break; // Stop loop on success
      } catch (err) {
        console.error(`[Summarize API] Model ${currentModel} exception:`, err);
        lastError = { status: 500, text: err.message };
        // continue loop
      }
    }

    if (!success) {
      return res.status(502).json({
        error: 'Gemini API error (All summary models failed)',
        details: lastError ? lastError.text : 'Unknown error'
      });
    }

    // Clean up title (remove double quotes, markdown bold, etc.)
    const cleanTitle = generatedTitle.replace(/^["'“”«]/, '').replace(/["'“”»]$/, '').replace(/\*\*?/g, '').trim();

    return res.status(200).json({ title: cleanTitle || '未命名情报' });
  } catch (err) {
    console.error('[Summarize API] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
