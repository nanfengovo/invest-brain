/**
 * OCR Worker — calls /api/ocr (Gemini Vision) for trade extraction.
 *
 * Replaces the old Tesseract.js approach with a multimodal LLM
 * that understands broker screenshot layouts from:
 * 复星, 长桥, 盈立, 盈透, 嘉信, and more.
 */

/**
 * Compress and convert a File/Blob to a base64 JPEG data URL string.
 */
function compressImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIMENSION = 1800; // 足够保持文字清晰度
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 使用 0.85 质量的 JPEG，在清晰度和文件大小之间取得最佳平衡
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse an image for trade information using Gemini Vision API.
 *
 * @param {File|Blob} image - The image to parse
 * @param {string} [model] - Gemini model to use (e.g. 'gemini-3.5-flash')
 * @returns {Promise<{ trades: Array<Object>, candidates: { symbols: string[], numbers: string[] } }>}
 */
export async function parseTradeImage(image, model) {
  const dataUrl = await compressImageToBase64(image);
  const mimeType = 'image/jpeg';

  const body = { image: dataUrl, mimeType };
  if (model) body.model = model;

  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `OCR API error: ${response.status}`);
  }

  const result = await response.json();
  console.log('[OCR Gemini Result]:', result);

  return normalizeOcrResult(result);
}

export function normalizeOcrResult(result = {}) {
  const trades = (result.trades || [])
    .filter(t => {
      // Only keep filled/executed trades
      const status = (t.status || '').toLowerCase();
      const isInvalid = status.includes('失效') || 
                        status.includes('失败') || 
                        status.includes('待成交') ||
                        status.includes('待确认');
      return !isInvalid;
    })
    .map(t => ({
      direction: t.direction || undefined,
      symbol: t.symbol || undefined,
      asset_name: t.asset_name || undefined,
      asset_type: t.asset_type || 'STOCK',
      quantity: t.quantity || undefined,
      price: t.price || undefined,
      fee: t.fee || 0,
      strike_price: t.strike_price || undefined,
      expiry_date: t.expiry_date || undefined,
      option_type: t.option_type || undefined,
      trade_time: t.trade_time || undefined,
      broker: t.broker || result.broker_detected || undefined,
    }));

  // Build candidates for the smart suggestion UI
  const candidates = extractCandidates(trades);

  return {
    trades,
    candidates,
    meta: normalizeOcrMeta(result),
  };
}

export function normalizeOcrMeta(result = {}) {
  const modelUsed = result.model_used || result.modelUsed || null;
  const requestedModel = result.requested_model || result.requestedModel || null;
  const fallbackValue = result.fallback_used ?? result.fallbackUsed;
  const retryCount = Number(result.retry_count ?? result.retryCount ?? 0);

  return {
    modelUsed,
    requestedModel,
    fallbackUsed: Boolean(
      fallbackValue ?? (modelUsed && requestedModel && modelUsed !== requestedModel)
    ),
    retryCount: Number.isFinite(retryCount) ? retryCount : 0,
    attemptedModels: Array.isArray(result.attempted_models)
      ? result.attempted_models
      : (Array.isArray(result.attemptedModels) ? result.attemptedModels : []),
  };
}

/**
 * Build suggestion pools from extracted trades for the capsule UI.
 */
function extractCandidates(trades) {
  const symbols = new Set();
  const numbers = new Set();

  for (const t of trades) {
    if (t.symbol) symbols.add(t.symbol);
    if (t.price != null) numbers.add(String(t.price));
    if (t.quantity != null) numbers.add(String(t.quantity));
    if (t.strike_price != null) numbers.add(String(t.strike_price));
    if (t.fee != null && t.fee > 0) numbers.add(String(t.fee));
  }

  return {
    symbols: [...symbols],
    numbers: [...numbers],
  };
}

/**
 * No-op init — kept for API compatibility but no longer needed
 * since we use a server-side API instead of Tesseract.js.
 */
export async function initOcr() {
  // No-op — Gemini API doesn't need client-side initialization
}
