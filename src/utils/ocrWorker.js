/**
 * OCR Worker — calls /api/ocr (Gemini Vision) for trade extraction.
 *
 * Replaces the old Tesseract.js approach with a multimodal LLM
 * that understands broker screenshot layouts from:
 * 复星, 长桥, 盈立, 盈透, 嘉信, and more.
 */

/**
 * Convert a File/Blob to a base64 data URL string.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse an image for trade information using Gemini Vision API.
 *
 * @param {File|Blob} image - The image to parse
 * @returns {Promise<{ trades: Array<Object>, candidates: { symbols: string[], numbers: string[] } }>}
 */
export async function parseTradeImage(image) {
  const dataUrl = await fileToBase64(image);
  const mimeType = image.type || 'image/png';

  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: dataUrl,
      mimeType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `OCR API error: ${response.status}`);
  }

  const result = await response.json();
  console.log('[OCR Gemini Result]:', result);

  // Transform Gemini result into the format TradeForm expects
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

  return { trades, candidates };
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
