import Tesseract, { createWorker } from 'tesseract.js';

console.log('[Cache Bust] 2026-06-03 v3 OCR');
let worker = null;
let initialized = false;

/**
 * Initialize the Tesseract worker
 */
export async function initOcr() {
  if (initialized) return;
  
  worker = await createWorker('chi_sim+eng', 1, {
    logger: m => console.log('[OCR]', m)
  });
  
  initialized = true;
}

/**
 * Parse an image for trade information
 * @param {File|Blob|string} image - The image to parse
 * @returns {Promise<Object>} Extracted trade data
 */
export async function parseTradeImage(image) {
  if (!initialized) {
    await initOcr();
  }

  const { data: { text } } = await worker.recognize(image);
  console.log('[OCR Result]:', text);

  return extractTradeData(text);
}

/**
 * Extract trade data from raw OCR text
 */
function extractTradeData(text) {
  const result = {};
  
  // Clean text: remove spaces between numbers and letters, but keep some structure
  const cleanText = text.replace(/\s+/g, ' ');

  // 1. Detect Direction
  if (/(买入|买|B|buy|买进)/i.test(cleanText)) result.direction = 'BUY';
  else if (/(卖出|卖|S|sell|平仓)/i.test(cleanText)) result.direction = 'SELL';

  // 2. Detect Symbol (e.g. AAPL, TSLA, 00700)
  // Look for 2-5 uppercase letters or 5-6 digits
  const symbolMatch = cleanText.match(/\b([A-Z]{2,5}|\d{5,6})\b/);
  if (symbolMatch) {
    result.symbol = symbolMatch[1];
  }

  // 3. Detect Price and Quantity via Keywords
  // Check for common Chinese broker labels
  const qtyRegex = /(?:数量|成交量|股数)[:：]?\s*(\d+)/;
  const qtyMatch = cleanText.match(qtyRegex);
  if (qtyMatch) {
    result.quantity = parseInt(qtyMatch[1], 10);
  }

  const priceRegex = /(?:价格|均价|成交价|成本)[:：]?\s*(\d+(?:\.\d+)?)/;
  const priceMatch = cleanText.match(priceRegex);
  if (priceMatch) {
    result.price = parseFloat(priceMatch[1]);
  }

  // Fallback if keywords fail
  if (!result.quantity || !result.price) {
    const numbers = [...cleanText.matchAll(/\b\d+(\.\d+)?\b/g)].map(m => parseFloat(m[0]));
    if (numbers.length > 0) {
      const integers = numbers.filter(n => Number.isInteger(n) && n > 0);
      const decimals = numbers.filter(n => !Number.isInteger(n) && n > 0);
      
      if (!result.quantity && integers.length > 0) {
        // Assume largest reasonable integer is quantity if no keywords match
        result.quantity = integers.find(n => n >= 10) || integers[0]; 
      }
      
      if (!result.price && decimals.length > 0) {
        result.price = decimals[0];
      } else if (!result.price && numbers.length > 1) {
        // If all are integers or no decimals found, fallback
        if (!result.quantity) result.quantity = numbers[0];
        if (!result.price) result.price = numbers[1] || numbers[0];
      }
    }
  }

  return result;
}
