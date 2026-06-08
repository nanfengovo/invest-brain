export const config = {
  maxDuration: 60,
};

const DEFAULT_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

const MAX_TRANSLATE_CHARS = 12000;

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

async function callGeminiTranslate({ apiKey, models, prompt }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastError = null;

  for (const model of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) {
          const errText = await response.text();
          lastError = { model, status: response.status, text: errText };
          if ((response.status === 429 || response.status === 503) && attempt === 0) {
            await sleep(1200);
            continue;
          }
          break;
        }

        const data = await response.json();
        const translatedText = (data.candidates?.[0]?.content?.parts || [])
          .map(part => part.text || '')
          .join('\n')
          .trim();

        if (translatedText) return { translatedText, model };
        lastError = { model, status: 200, text: '模型返回为空' };
        break;
      } catch (error) {
        lastError = { model, status: 500, text: error.message };
        break;
      }
    }
  }

  const detail = lastError ? `${lastError.model}: ${lastError.text}` : '未知错误';
  throw new Error(detail);
}

export default async function handler(req, res) {
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
    if (!apiKey) {
      return res.status(401).json({ error: '请先在设置页面配置 Gemini API Key' });
    }

    const { text, title = '', sourceLanguage = 'auto' } = req.body || {};
    const sourceText = truncateText(text, MAX_TRANSLATE_CHARS);
    if (!sourceText) {
      return res.status(400).json({ error: '没有可翻译的正文' });
    }

    const prompt = `你是投资情报翻译助手。请把下面的材料翻译成简体中文。

要求：
1. 保留 Markdown 段落、标题、列表、引用等结构。
2. 股票代码、公司名、产品名、技术名可以保留英文或常用中文译名。
3. 不要总结、不要删减观点、不要添加原文没有的信息。
4. 如果原文中有链接或代码块，请保留。
5. 只输出翻译后的中文正文，不要解释。

标题：${title || '无'}
来源语言：${sourceLanguage}

原文：
${sourceText}`;

    const models = getGeminiModelPool(
      process.env.GEMINI_TRANSLATE_MODELS,
      process.env.GEMINI_MODELS,
      process.env.GEMINI_MODEL,
    );
    const { translatedText, model } = await callGeminiTranslate({ apiKey, models, prompt });

    return res.status(200).json({
      success: true,
      translatedText,
      model,
      truncated: String(text || '').length > sourceText.length,
    });
  } catch (error) {
    console.error('[Translate API] Error:', error);
    return res.status(502).json({
      error: '翻译失败，请稍后重试',
      details: error.message,
    });
  }
}
