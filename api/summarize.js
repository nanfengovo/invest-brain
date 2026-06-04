/**
 * Vercel Serverless Function — /api/summarize
 *
 * Uses Gemini to summarize a short title for information cards based on:
 * 1. Pasted text content
 * 2. URL page metadata (parsed inside the function)
 * 3. Base64 uploaded images
 */

export const config = {
  maxDuration: 60,
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

    // 1. If URL is provided, try parsing it (with graceful fallback)
    if (url) {
      let pageDetails = `URL: ${url}\n`;
      
      const urlHost = (() => {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
      })();
      
      // Special handling for X/Twitter: use public oEmbed API to get tweet text
      const isTwitter = ['x.com', 'twitter.com'].some(d => urlHost === d || urlHost.endsWith('.' + d));
      
      if (isTwitter) {
        try {
          console.log(`[Summarize API] Using X oEmbed API for: ${url}`);
          const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
          const oembedResp = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
          if (oembedResp.ok) {
            const oembedData = await oembedResp.json();
            // Extract plain text from HTML blockquote
            const tweetText = (oembedData.html || '')
              .replace(/<[^>]+>/g, ' ')  // strip HTML tags
              .replace(/&mdash;/g, '—')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/\s+/g, ' ')
              .trim();
            const author = oembedData.author_name || '';
            pageDetails += `来源平台: X/Twitter\n作者: ${author}\n推文内容: ${tweetText}`;
          } else {
            pageDetails += `来源平台: X/Twitter\n无法获取推文内容（oEmbed 返回 ${oembedResp.status}），请根据 URL 推断。`;
          }
        } catch (e) {
          console.warn(`[Summarize API] X oEmbed failed:`, e.message);
          pageDetails += `来源平台: X/Twitter\n无法获取推文内容（${e.message}）。`;
        }
      } else {
        try {
          console.log(`[Summarize API] Fetching metadata for URL: ${url}`);
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
          });

          if (response.ok) {
            const htmlText = await response.text();

            const titleMatch = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const rawTitle = titleMatch ? titleMatch[1].trim() : '';

            const ogTitleMatch = htmlText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                                 htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
            const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : '';

            const descMatch = htmlText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                              htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
            const desc = descMatch ? descMatch[1].trim() : '';

            pageDetails += `网页原始标题: ${rawTitle}\n社交网络标题(og): ${ogTitle}\n描述信息: ${desc}`;
          } else {
            pageDetails += `抓取网页失败（状态码 ${response.status}），请根据 URL 格式推断内容。`;
          }
        } catch (e) {
          console.warn(`[Summarize API] URL fetch failed (expected for SPAs):`, e.message);
          pageDetails += `无法抓取网页（${e.message}），请根据 URL 格式和你的知识推断内容。`;
        }
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

    // Call Gemini API with retry + fallback
    const summarizeModels = [
      'gemini-2.5-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
    ];

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let lastError = null;
    let success = false;
    let generatedTitle = '';

    for (const currentModel of summarizeModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
      
      // Retry up to 2 times for each model on 503/429
      for (let attempt = 0; attempt < 2; attempt++) {
        console.log(`[Summarize API] Trying model: ${currentModel} (attempt ${attempt + 1})`);
        try {
          const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 200,
              },
            }),
          });

          if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            console.warn(`[Summarize API] Model ${currentModel} HTTP ${geminiResponse.status}`);
            lastError = { status: geminiResponse.status, text: errText };
            if ((geminiResponse.status === 503 || geminiResponse.status === 429) && attempt === 0) {
              await sleep(3000);
              continue; // retry same model
            }
            break; // move to next model
          }

          const data = await geminiResponse.json();
          generatedTitle = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
          
          // Validate: title must be at least 4 characters, otherwise try next model
          if (generatedTitle.length < 4) {
            console.warn(`[Summarize API] Model ${currentModel} returned too-short title: "${generatedTitle}", trying next`);
            lastError = { status: 200, text: `Title too short: "${generatedTitle}"` };
            break; // try next model
          }
          
          success = true;
          console.log(`[Summarize API] Success with model: ${currentModel}, title: "${generatedTitle}"`);
          break;
        } catch (err) {
          console.error(`[Summarize API] Model ${currentModel} exception:`, err);
          lastError = { status: 500, text: err.message };
          break;
        }
      }
      if (success) break;
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
