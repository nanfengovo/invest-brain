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

const DEFAULT_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
];

const MAX_READER_CHARS = 9000;
const MAX_RETURN_CONTENT_CHARS = 3500;
const MAX_USER_CONTENT_CHARS = 9000;

function uniqueValues(values) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}

function getGeminiModelPool(...configuredValues) {
  const configuredModels = configuredValues
    .flatMap(value => String(value || '').split(','))
    .map(model => model.trim())
    .filter(Boolean);

  return uniqueValues([...configuredModels, ...DEFAULT_GEMINI_MODELS]);
}

function truncateText(text, limit) {
  const normalized = String(text || '').replace(/\s+\n/g, '\n').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    });
}

function cleanMarkdownForPrompt(markdown) {
  return String(markdown || '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/Don.t miss what.s happening[\s\S]*?Sign up[^\n]*\n?/i, '')
    .replace(/## New to X\?[\s\S]*$/i, '')
    .trim();
}

const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

function getYouTubeId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (!host.endsWith('youtube.com')) return null;
    const watchId = parsed.searchParams.get('v');
    if (watchId) return watchId;
    const [kind, id] = parsed.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(kind) && id) return id;
  } catch { /* ignore */ }
  return null;
}

function getBilibiliId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/video\/(BV[\w]+)/i);
    return match ? match[1] : null;
  } catch { /* ignore */ }
  return null;
}

function getVimeoId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\./, '').endsWith('vimeo.com')) return null;
    return parsed.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part)) || null;
  } catch { /* ignore */ }
  return null;
}

function buildYouTubeEmbedUrl(videoId) {
  if (!videoId) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    vq: 'hd1080',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function buildBilibiliEmbedUrl(bvid) {
  if (!bvid) return null;
  const params = new URLSearchParams({
    bvid,
    high_quality: '1',
    danmaku: '0',
    autoplay: '0',
  });
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

function buildVimeoEmbedUrl(videoId) {
  if (!videoId) return null;
  const params = new URLSearchParams({
    dnt: '1',
    quality: '1080p',
  });
  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

function detectVideoPlatform(url) {
  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      platform: 'youtube',
      provider: 'YouTube',
      videoId: youtubeId,
      embedUrl: buildYouTubeEmbedUrl(youtubeId),
    };
  }

  const bilibiliId = getBilibiliId(url);
  if (bilibiliId) {
    return {
      platform: 'bilibili',
      provider: 'Bilibili',
      videoId: bilibiliId,
      embedUrl: buildBilibiliEmbedUrl(bilibiliId),
    };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      platform: 'vimeo',
      provider: 'Vimeo',
      videoId: vimeoId,
      embedUrl: buildVimeoEmbedUrl(vimeoId),
    };
  }

  return null;
}

function extractUrls(text = '') {
  return [...new Set(String(text || '').match(URL_PATTERN) || [])]
    .map((url) => url.replace(/[，。；;,.]+$/g, ''));
}

function isVideoUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|#|$)/i.test(url)
    || /video\.twimg\.com\/.+\.(mp4|m3u8)(\?|#|$)/i.test(url)
    || Boolean(detectVideoPlatform(url));
}

function isImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)
    || /pbs\.twimg\.com\/media\//i.test(url)
    || /pbs\.twimg\.com\/amplify_video_thumb\//i.test(url);
}

function isPdfUrl(url = '') {
  return /\.pdf(\?|#|$)/i.test(url);
}

function isEpubUrl(url = '') {
  return /\.epub(\?|#|$)/i.test(url);
}

function looksLikeHtml(content = '') {
  return /<\/?(article|section|main|p|h[1-6]|div|table|figure|blockquote|ul|ol|img|a)\b/i.test(content);
}

function detectDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function detectFormat({ url, content, mimeType }) {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || isPdfUrl(url)) return 'pdf';
  if (mimeType === 'application/epub+zip' || isEpubUrl(url)) return 'epub';
  if (isVideoUrl(url)) return 'video';
  if (isImageUrl(url)) return 'image';
  if (looksLikeHtml(content)) return 'html';
  if (content) return 'markdown';
  if (url) return 'webpage';
  return 'unknown';
}

function detectInfoType(format) {
  if (format === 'video') return 'VIDEO';
  if (format === 'image') return 'IMAGE';
  if (format === 'pdf' || format === 'epub') return 'BOOK';
  return 'ARTICLE';
}

function buildMediaFromValues(...values) {
  const urls = extractUrls(values.filter(Boolean).join('\n'));
  const videos = uniqueValues(urls.filter(isVideoUrl));
  const images = uniqueValues(urls.filter(isImageUrl));
  return {
    videos,
    images,
    primaryVideo: videos[0] || null,
    primaryImage: images[0] || null,
  };
}

function buildParsedInformation({
  title,
  summary,
  url,
  content,
  author,
  media,
  contentSource,
  mimeType,
}) {
  const inferredMedia = buildMediaFromValues(url, content, media?.videoUrl, media?.thumbnailUrl);
  const videoPlatform = detectVideoPlatform(url);
  const mergedMedia = {
    videos: uniqueValues([...(inferredMedia.videos || []), media?.videoUrl]),
    images: uniqueValues([...(inferredMedia.images || []), media?.thumbnailUrl]),
    platform: videoPlatform?.platform || media?.platform || null,
    provider: videoPlatform?.provider || media?.provider || null,
    videoId: videoPlatform?.videoId || media?.videoId || null,
    embedUrl: videoPlatform?.embedUrl || media?.embedUrl || null,
  };
  mergedMedia.primaryVideo = mergedMedia.videos[0] || null;
  mergedMedia.primaryImage = mergedMedia.images[0] || null;

  const format = detectFormat({ url, content, mimeType });
  const domain = detectDomain(url);

  return {
    title,
    summary: summary || null,
    type: detectInfoType(format),
    format,
    content: content || null,
    source: {
      url: url || null,
      domain,
      author: author || null,
      contentSource: contentSource || null,
    },
    media: mergedMedia,
    embeddable: ['image', 'video', 'pdf', 'html', 'markdown'].includes(format) || Boolean(mergedMedia.primaryVideo || mergedMedia.primaryImage),
    externalUrl: url || null,
  };
}

function getTwitterPostId(url = '') {
  try {
    const match = new URL(url).pathname.match(/\/status(?:es)?\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function pickBestVideoVariant(variants = []) {
  const mp4Variants = variants
    .filter((variant) => variant?.url && variant.content_type === 'video/mp4')
    .sort((a, b) => Number(b.bit_rate || 0) - Number(a.bit_rate || 0));
  return mp4Variants[0]?.url || variants.find((variant) => variant?.url)?.url || null;
}

async function resolveTwitterMediaViaApi(url) {
  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  const tweetId = getTwitterPostId(url);
  if (!bearerToken || !tweetId) return null;

  const params = new URLSearchParams({
    expansions: 'attachments.media_keys',
    'tweet.fields': 'attachments',
    'media.fields': 'duration_ms,height,media_key,preview_image_url,type,url,width,variants',
  });
  const response = await fetch(`https://api.x.com/2/tweets/${tweetId}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    console.warn(`[Summarize API] X media API returned ${response.status}`);
    return null;
  }

  const data = await response.json();
  const mediaItems = data.includes?.media || [];
  const videoItem = mediaItems.find((item) => item.type === 'video' || item.type === 'animated_gif');
  const imageItem = mediaItems.find((item) => item.type === 'photo');
  return {
    videoUrl: pickBestVideoVariant(videoItem?.variants || []),
    thumbnailUrl: videoItem?.preview_image_url || imageItem?.url || null,
    mediaType: videoItem?.type || imageItem?.type || null,
  };
}

function buildJinaReaderUrl(url) {
  return `https://r.jina.ai/${url}`;
}

function deriveTitleFromContent(content = '') {
  const text = String(content || '');
  const titleMatch = text.match(/^Title:\s*(.+)$/im);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  const headingMatch = text.match(/^#{1,2}\s+(.+)$/m);
  if (headingMatch?.[1]) return headingMatch[1].trim();

  const firstUsefulLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^Markdown Content:/i.test(line));
  return firstUsefulLine || '';
}

function buildFallbackTitle({ url, content, media, pageTitle }) {
  const contentTitle = deriveTitleFromContent(content);
  const title = pageTitle || contentTitle;
  if (title) return cleanGeneratedTitle(title);

  if (media?.provider) return `${media.provider} 视频材料`;

  const domain = detectDomain(url);
  return domain ? `${domain} 链接材料` : '未命名情报';
}

async function fetchReaderMarkdown(url) {
  const response = await fetch(buildJinaReaderUrl(url), {
    headers: {
      'Accept': 'text/plain, text/markdown;q=0.9, */*;q=0.8',
      'User-Agent': 'InvestBrain/1.0 (+https://investbrain.local)',
    },
    signal: AbortSignal.timeout(12000),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Jina Reader returned ${response.status}`);
  }

  const markdown = cleanMarkdownForPrompt(await response.text());
  if (!markdown || markdown.length < 80) {
    throw new Error('Jina Reader returned too little content');
  }

  return truncateText(markdown, MAX_READER_CHARS);
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return null;
  }

  try {
    return JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }
}

function parseStructuredSummary(rawResponse) {
  const json = parseJsonObject(rawResponse);
  if (json) {
    return {
      title: String(json.title || '').trim(),
      summary: String(json.summary || '').trim(),
    };
  }

  const titleLineMatch = rawResponse.match(/标题[::：]\s*(.+)/m);
  const summaryLineMatch = rawResponse.match(/摘要[::：]\s*(.+)/m);
  if (titleLineMatch) {
    return {
      title: titleLineMatch[1].trim(),
      summary: summaryLineMatch ? summaryLineMatch[1].trim() : '',
    };
  }

  return {
    title: rawResponse.trim(),
    summary: '',
  };
}

function cleanGeneratedTitle(title) {
  return String(title || '')
    .replace(/^["'\u201c\u201d\u00ab]/, '')
    .replace(/["'\u201c\u201d\u00bb]$/, '')
    .replace(/\*\*?/g, '')
    .replace(/^标题[::：]\s*/i, '')
    .trim()
    .slice(0, 60);
}

async function callGeminiWithModelPool({ apiKey, models, parts, maxOutputTokens = 700 }) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let lastError = null;

  for (const currentModel of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`[Summarize API] Trying model: ${currentModel} (attempt ${attempt + 1})`);
      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          console.warn(`[Summarize API] Model ${currentModel} HTTP ${geminiResponse.status}`);
          lastError = { status: geminiResponse.status, text: errText, model: currentModel };
          if ((geminiResponse.status === 429 || geminiResponse.status === 503) && attempt === 0) {
            await sleep(1200);
            continue;
          }
          break;
        }

        const data = await geminiResponse.json();
        const rawResponse = (data.candidates?.[0]?.content?.parts || [])
          .map(part => part.text || '')
          .join('\n')
          .trim();

        if (!rawResponse) {
          lastError = { status: 200, text: 'Empty model response', model: currentModel };
          break;
        }

        return { rawResponse, model: currentModel };
      } catch (err) {
        console.error(`[Summarize API] Model ${currentModel} exception:`, err);
        lastError = { status: 500, text: err.message, model: currentModel };
        break;
      }
    }
  }

  const details = lastError
    ? `${lastError.model || 'unknown model'}: ${lastError.text}`
    : 'Unknown error';
  throw new Error(details);
}

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

  try {
    const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
    const { url, content, image, mimeType = 'image/png' } = req.body;

    if (!url && !content && !image) {
      return res.status(400).json({ error: 'Please provide either url, content, or image.' });
    }

    if (!apiKey && image && !url && !content) {
      return res.status(500).json({ error: '图片解析需要配置 Gemini API Key。也可以先手动填写标题和正文。' });
    }

    let summaryPromptText = '';
    const parts = [];
    let extractedContent = null;
    let extractedAuthor = null;
    let extractedSummary = null;
    let extractedPageTitle = null;
    let contentSource = null;
    let extractedMedia = null;

    // 1. If URL is provided, try parsing it (with graceful fallback)
    if (url) {
      let pageDetails = `URL: ${url}\n`;
      
      const urlHost = (() => {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
      })();
      
      try {
        console.log(`[Summarize API] Fetching Reader markdown for URL: ${url}`);
        const readerMarkdown = await fetchReaderMarkdown(url);
        pageDetails += `LLM友好 Markdown 正文（Jina Reader 抽取）:\n${readerMarkdown}\n`;
        extractedContent = readerMarkdown;
        contentSource = 'jina-reader';
      } catch (e) {
        console.warn(`[Summarize API] Jina Reader failed:`, e.message);
        pageDetails += `Jina Reader 抽取失败：${e.message}\n`;
      }

      // Special handling for X/Twitter: use public oEmbed API as author/text fallback.
      const isTwitter = ['x.com', 'twitter.com'].some(d => urlHost === d || urlHost.endsWith('.' + d));
      const videoPlatform = detectVideoPlatform(url);

      if (videoPlatform) {
        pageDetails += `视频平台: ${videoPlatform.provider}\n视频ID: ${videoPlatform.videoId}\n内嵌播放地址: ${videoPlatform.embedUrl}\n`;
        extractedMedia = {
          ...(extractedMedia || {}),
          platform: videoPlatform.platform,
          provider: videoPlatform.provider,
          videoId: videoPlatform.videoId,
          embedUrl: videoPlatform.embedUrl,
        };
        contentSource = contentSource || `${videoPlatform.platform}-embed`;
      }
      
      if (isTwitter) {
        try {
          console.log(`[Summarize API] Using X oEmbed API for: ${url}`);
          extractedMedia = await resolveTwitterMediaViaApi(url);
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
            pageDetails += `来源平台: X/Twitter\n作者: ${author}\noEmbed 推文内容: ${tweetText}`;
            if (!extractedContent) {
              extractedContent = tweetText;
              contentSource = 'x-oembed';
            }
            if (extractedMedia?.videoUrl || extractedMedia?.thumbnailUrl) {
              const mediaLines = [
                extractedMedia.videoUrl ? `视频地址: ${extractedMedia.videoUrl}` : null,
                extractedMedia.thumbnailUrl ? `封面地址: ${extractedMedia.thumbnailUrl}` : null,
              ].filter(Boolean).join('\n');
              extractedContent = extractedContent ? `${extractedContent}\n\n${mediaLines}` : mediaLines;
            }
            extractedAuthor = author;
          } else {
            pageDetails += `来源平台: X/Twitter\n无法获取推文内容（oEmbed 返回 ${oembedResp.status}）。`;
          }
        } catch (e) {
          console.warn(`[Summarize API] X oEmbed failed:`, e.message);
          pageDetails += `来源平台: X/Twitter\n无法获取推文内容（${e.message}）。`;
        }
      } else if (!extractedContent) {
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
            const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : '';

            const ogTitleMatch = htmlText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                                 htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
            const ogTitle = ogTitleMatch ? decodeHtmlEntities(ogTitleMatch[1]).trim() : '';
            extractedPageTitle = ogTitle || rawTitle || extractedPageTitle;

            const descMatch = htmlText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                              htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
            const desc = descMatch ? decodeHtmlEntities(descMatch[1]).trim() : '';

            // Deep content extraction: extract article body text
            let bodyText = '';
            try {
              // Remove script, style, nav, header, footer, aside, noscript tags and their content
              let cleaned = htmlText
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[\s\S]*?<\/nav>/gi, '')
                .replace(/<header[\s\S]*?<\/header>/gi, '')
                .replace(/<footer[\s\S]*?<\/footer>/gi, '')
                .replace(/<aside[\s\S]*?<\/aside>/gi, '')
                .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

              // Try to find content in <article>, <main>, or fall back to <body>
              const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
              const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
              const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
              const contentHtml = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || cleaned;

              // Strip remaining HTML tags to get plain text
              bodyText = decodeHtmlEntities(contentHtml
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim());

              // Trim to first 3000 characters
              if (bodyText.length > 3000) {
                bodyText = bodyText.substring(0, 3000) + '...';
              }
            } catch (e) {
              console.warn('[Summarize API] Body text extraction failed:', e.message);
            }

            pageDetails += `网页原始标题: ${rawTitle}\n社交网络标题(og): ${ogTitle}\n描述信息: ${desc}`;
            if (bodyText) {
              pageDetails += `\n正文摘要: ${bodyText}`;
              extractedContent = bodyText;
              contentSource = 'html-fallback';
            }
          } else {
            pageDetails += `抓取网页失败（状态码 ${response.status}）。`;
          }
        } catch (e) {
          console.warn(`[Summarize API] URL fetch failed (expected for SPAs):`, e.message);
          pageDetails += `无法抓取网页（${e.message}）。`;
        }
      }
      summaryPromptText += `【用户提供了来源链接信息】\n${pageDetails}\n\n`;
    }

    // 2. If text content is provided
    if (content) {
      summaryPromptText += `【用户提供了摘录/正文内容】\n${truncateText(content, MAX_USER_CONTENT_CHARS)}\n\n`;
    }

    // 3. Build instructions
    let instruction = `你是一个专业的投资情报分析助手。请基于上面已经抓取到的正文、Markdown、网页标题、描述或图片内容，生成信息卡片标题和摘要。

规则：
1. 全部输出简体中文，股票代码、公司名、产品名、平台名可保留英文。
2. 标题严格控制在 30 个汉字以内，必须概括核心事实或观点，不要只翻译网页标题。
3. 摘要控制在 100 个汉字以内，说明文章/帖子真正讲了什么，以及它和投资情报的关系。
4. 如果是视频链接，可以基于平台、网页标题、描述和用户摘录生成标题；如果是普通文章且正文不足，只能写“内容不足，需人工补充正文”，不要根据 URL、域名或常识猜测。
5. 只输出 JSON，不要 Markdown，不要解释。

JSON 格式：
{"title":"...","summary":"..."}`;
    
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

    const summarizeModels = getGeminiModelPool(
      process.env.GEMINI_SUMMARY_MODELS,
      process.env.GEMINI_MODELS,
      process.env.GEMINI_MODEL,
    );

    let generatedTitle = '';
    let modelUsed = '';

    if (apiKey) {
      try {
        const { rawResponse, model } = await callGeminiWithModelPool({
          apiKey,
          models: summarizeModels,
          parts,
        });
        modelUsed = model;
        const parsed = parseStructuredSummary(rawResponse);
        generatedTitle = parsed.title;
        extractedSummary = parsed.summary ? parsed.summary.slice(0, 100) : extractedSummary;
      } catch (err) {
        console.warn('[Summarize API] Gemini failed, falling back to deterministic link parsing:', err.message);
        if (!extractedContent && !extractedMedia && image) {
          return res.status(502).json({
            error: 'Gemini API error (All summary models failed)',
            details: err.message,
          });
        }
      }
    }

    const cleanTitle = cleanGeneratedTitle(generatedTitle)
      || buildFallbackTitle({
        url,
        content: extractedContent || content,
        media: extractedMedia,
        pageTitle: extractedPageTitle,
      });

    // For Twitter posts, generate summary from tweet text if not already set
    if (!extractedSummary && extractedContent) {
      extractedSummary = extractedContent.substring(0, 100);
    }

    const responseContent = extractedContent ? truncateText(extractedContent, MAX_RETURN_CONTENT_CHARS) : null;
    const parsed = buildParsedInformation({
      title: cleanTitle || '未命名情报',
      summary: extractedSummary || null,
      url,
      content: responseContent,
      author: extractedAuthor,
      media: extractedMedia,
      contentSource,
      mimeType,
    });

    return res.status(200).json({
      title: cleanTitle || '未命名情报',
      summary: extractedSummary || null,
      content: responseContent,
      author: extractedAuthor,
      media: extractedMedia || null,
      contentSource,
      parsed,
      model: modelUsed,
    });
  } catch (err) {
    console.error('[Summarize API] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
