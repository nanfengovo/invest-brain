/**
 * Vercel Serverless Function — /api/ocr
 *
 * Receives a broker screenshot (base64) and uses
 * Gemini multimodal models to extract structured trade data.
 * Supports model selection from the frontend.
 * Supports: 复星, 长桥, 盈立, 盈透, 嘉信, and more.
 */

const ALLOWED_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
];

const DEFAULT_MODEL = 'gemini-3.5-flash';

export const config = {
  maxDuration: 60,
};

const SYSTEM_PROMPT = `你是一个专业的证券交易记录 OCR 系统。你需要从用户提供的券商 App 截图中提取交易记录信息。

支持的券商包括但不限于：复星证券(美股Pro)、长桥证券、盈立证券、盈透证券(Interactive Brokers/IBKR)、嘉信理财(Charles Schwab)。

请严格按照以下 JSON 格式输出提取到的交易记录：

{
  "trades": [
    {
      "broker": "券商名称",
      "direction": "BUY 或 SELL（买入/开仓=BUY，卖出/平仓/已卖出=SELL）",
      "symbol": "股票代码（纯大写字母，不含.US/.HK后缀，例如 AAPL、GOOG、NOK）",
      "asset_name": "产品名称（如有）",
      "asset_type": "STOCK 或 OPTION 或 ETF",
      "quantity": 数量（数字类型），
      "price": 价格（数字类型，成交价或委托价），
      "fee": 手续费（数字类型，如有；没有则为0），
      "trade_time": "交易时间（ISO格式如 2026-06-03T10:49:00，如果只有日期没有时间则设时间为 00:00:00）",
      "status": "全部成交/待成交/已失效/下单失败/待确认（原文状态）",
      "strike_price": 行权价（期权才有，数字类型），
      "expiry_date": "到期日（期权才有，格式 YYYY-MM-DD）",
      "option_type": "CALL 或 PUT（期权才有）"
    }
  ],
  "page_type": "order_history 或 holdings 或 trade_detail 或 unknown",
  "broker_detected": "识别到的券商名称"
}

重要规则：
1. 如果截图是持仓页面（holdings），page_type 设为 "holdings"，此时不一定有交易方向
2. 如果截图是订单/交易历史页面，page_type 设为 "order_history"
3. 期权代码格式各券商不同：
   - 复星：如 "HIMX CALL 20260918 28.0" → symbol=HIMX, expiry=2026-09-18, strike=28.0, type=CALL
   - 长桥：如 "ASTS Call 20260710 130" → symbol=ASTS, expiry=2026-07-10, strike=130, type=CALL
   - 盈立：如 "NOK 260918 15.00 C" → symbol=NOK, expiry=2026-09-18, strike=15.0, type=CALL
   - 盈透：如 "CLF SEP 18 '26 12 ..." → symbol=CLF, expiry=2026-09-18, type根据上下文判断
   - 嘉信：如 "GOOG JUL 17 '26 405 Call" → symbol=GOOG, expiry=2026-07-17, strike=405, type=CALL
4. 只提取状态为"全部成交"或"已成交"的交易，跳过"已失效"、"下单失败"、"待成交"的记录
5. 日期年份：如果截图中只有月/日（如 "06/03"），请根据截图中的其他上下文推断年份，默认为当前年份 2026
6. 如果截图中没有可识别的交易数据，返回空的 trades 数组
7. 只输出 JSON，不要输出任何其他文字、解释或 markdown 标记`;

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
    const { image, mimeType = 'image/png', model: requestedModel } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Validate and select preferred model
    const preferredModel = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    
    // Build fallback list (excluding preferred)
    const fallbackModels = ALLOWED_MODELS.filter(m => m !== preferredModel);

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /**
     * Attempt a single Gemini API call. Returns { success, data } or { success: false, error }.
     */
    async function tryModel(model) {
      console.log(`[OCR API] Trying model: ${model}`);
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: SYSTEM_PROMPT },
                  { inlineData: { mimeType, data: base64Data } },
                  { text: '请分析这张券商截图，提取所有可识别的交易记录。' },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.warn(`[OCR API] Model ${model} HTTP ${geminiResponse.status}`);
        return { success: false, status: geminiResponse.status, error: errorText };
      }

      const geminiData = await geminiResponse.json();
      const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let parsed;
      try {
        parsed = JSON.parse(textContent);
      } catch {
        const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1].trim());
        } else {
          const braceMatch = textContent.match(/\{[\s\S]*\}/);
          if (braceMatch) {
            parsed = JSON.parse(braceMatch[0]);
          } else {
            throw new Error('Could not parse Gemini response as JSON');
          }
        }
      }

      console.log(`[OCR API] Success with model: ${model}`);
      return { success: true, data: parsed, modelUsed: model };
    }

    // Strategy: Retry preferred model up to 3 times (with 3s delays), then try fallbacks
    let lastError = null;
    const MAX_PREFERRED_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_PREFERRED_RETRIES; attempt++) {
      try {
        const result = await tryModel(preferredModel);
        if (result.success) {
          result.data.modelUsed = result.modelUsed;
          return res.status(200).json(result.data);
        }
        lastError = result.error;
        // If 503/429, wait 3 seconds before retry
        if (result.status === 503 || result.status === 429) {
          console.log(`[OCR API] Preferred model ${preferredModel} overloaded, retrying in 3s (attempt ${attempt + 1}/${MAX_PREFERRED_RETRIES})`);
          await sleep(3000);
        } else {
          // Other errors (400, 404, etc.) — don't retry, go to fallback
          break;
        }
      } catch (err) {
        console.error(`[OCR API] Preferred model exception:`, err);
        lastError = err.message;
        break;
      }
    }

    // Fallback to alternative models (no retries, just try each once)
    for (const fbModel of fallbackModels) {
      try {
        const result = await tryModel(fbModel);
        if (result.success) {
          result.data.modelUsed = result.modelUsed;
          return res.status(200).json(result.data);
        }
        lastError = result.error;
      } catch (err) {
        console.error(`[OCR API] Fallback model ${fbModel} exception:`, err);
        lastError = err.message;
      }
    }

    return res.status(502).json({
      error: 'Gemini API error',
      details: typeof lastError === 'string' ? lastError : 'All models failed after retries'
    });
  } catch (err) {
    console.error('[OCR API] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
