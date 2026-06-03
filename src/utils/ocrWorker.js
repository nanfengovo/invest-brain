import { createWorker } from 'tesseract.js';

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
  
  // Clean text
  const cleanText = text.replace(/\s+/g, ' ');

  // 1. Detect Direction
  if (/(买入|买|B|buy|买进)/i.test(cleanText)) result.direction = 'BUY';
  else if (/(卖出|卖|S|sell)/i.test(cleanText)) result.direction = 'SELL';

  // 2. Detect Symbol (e.g. AAPL, TSLA, 00700)
  // Look for 2-5 uppercase letters or 5-6 digits
  const symbolMatch = cleanText.match(/\b([A-Z]{2,5}|\d{5,6})\b/);
  if (symbolMatch) {
    result.symbol = symbolMatch[1];
  }

  // 3. Detect Price and Quantity
  // Looking for numbers. This is a naive implementation since broker UIs differ heavily.
  // Generally, the quantity is an integer, price is a decimal.
  const numbers = [...cleanText.matchAll(/\b\d+(\.\d+)?\b/g)].map(m => parseFloat(m[0]));
  
  if (numbers.length > 0) {
    // Attempt to guess which is price and which is quantity.
    // Usually quantity is an integer (e.g., 100, 200, 10).
    const integers = numbers.filter(n => Number.isInteger(n) && n > 0);
    const decimals = numbers.filter(n => !Number.isInteger(n));
    
    if (integers.length > 0) {
      result.quantity = integers[0]; // Take first integer as quantity
    }
    
    if (decimals.length > 0) {
      result.price = decimals[0]; // Take first decimal as price
    } else if (numbers.length > 1) {
      // If all are integers or no decimals found, just take the first two
      if (!result.quantity) result.quantity = numbers[0];
      if (!result.price) result.price = numbers[1] || numbers[0];
    }
  }

  return result;
}
