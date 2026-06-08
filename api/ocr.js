/**
 * Vercel Serverless Function — /api/ocr
 *
 * Receives a broker screenshot (base64) and uses
 * Gemini/NVIDIA multimodal models to extract structured trade data.
 * Supports model selection from the frontend.
 * Supports: 复星, 长桥, 盈立, 盈透, 嘉信, and more.
 */

import {
  buildAiMetadata,
  callAiWithModelPool,
  getAiKeys,
  getAiModelPool,
  hasAnyAiKey,
  NVIDIA_VISION_MODELS,
  parseAiJsonObject,
} from './_lib/aiProviders.js';

export const OCR_MODEL_OPTIONS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
  ...NVIDIA_VISION_MODELS,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key, x-nvidia-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  const keys = getAiKeys(req);
  if (!hasAnyAiKey(keys)) {
    return res.status(500).json({ error: 'AI API Key 未配置，请先在设置页添加 Gemini 或 NVIDIA Key。' });
  }

  try {
    const {
      image,
      mimeType = 'image/png',
      model: requestedModel,
      visionModel,
      aiProvider = 'auto',
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: '请先上传需要识别的截图' });
    }

    const preferredModel = String(visionModel || requestedModel || DEFAULT_MODEL).trim();
    const models = getAiModelPool({
      task: 'vision',
      provider: aiProvider,
      requestedModel: preferredModel,
      configuredValues: [
        process.env.NVIDIA_OCR_MODELS,
        process.env.NVIDIA_VISION_MODELS,
        process.env.NVIDIA_MODELS,
        process.env.GEMINI_OCR_MODELS,
        process.env.GEMINI_VISION_MODELS,
        process.env.GEMINI_MODELS,
      ],
      keys,
    });

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const aiResult = await callAiWithModelPool({
      keys,
      models,
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType, data: base64Data } },
        { text: '请分析这张券商截图，提取所有可识别的交易记录。' },
      ],
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      temperature: 0.1,
      preferredRetries: 3,
    });
    const parsed = parseAiJsonObject(aiResult.rawResponse);
    const metadata = buildAiMetadata(aiResult, preferredModel);

    return res.status(200).json({
      ...parsed,
      ...metadata,
    });
  } catch (err) {
    console.error('[OCR API] Error:', err);
    return res.status(500).json({ error: err.message || 'OCR 识别服务异常' });
  }
}
