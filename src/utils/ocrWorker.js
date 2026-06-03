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
  console.log('[OCR Raw Text]:', text);

  return extractTradeData(text);
}

/**
 * Extract trade data from raw OCR text.
 * Optimized for Longbridge / Tiger / Futu broker screenshots.
 */
function extractTradeData(text) {
  const result = {};
  
  // Normalize: collapse whitespace, keep line breaks for structure
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fullText = lines.join(' ');
  
  console.log('[OCR Lines]:', lines);

  // ──────────────────────────────────────────────
  // 1. Direction (买入/卖出)
  // ──────────────────────────────────────────────
  // Longbridge shows "买入" or "卖出" prominently
  for (const line of lines) {
    if (/买入/.test(line)) { result.direction = 'BUY'; break; }
    if (/卖出/.test(line)) { result.direction = 'SELL'; break; }
  }
  // Fallback to full text
  if (!result.direction) {
    if (/买入|买进|buy/i.test(fullText)) result.direction = 'BUY';
    else if (/卖出|卖|sell|平仓/i.test(fullText)) result.direction = 'SELL';
  }

  // ──────────────────────────────────────────────
  // 2. Symbol / Ticker (e.g. DRAM, AAPL, TSLA, 00700)
  // ──────────────────────────────────────────────
  // Longbridge format: "名称代码  Roundhill记忆ETF\n DRAM"
  // or shows ticker on its own line, or after ".US" / ".HK"
  
  // Try to find a line or text with common broker code patterns
  // Pattern: standalone 1-6 uppercase letters (ticker), often on its own line
  // Exclude common OCR noise like "ETF", "CALL", "PUT" as standalone symbols
  const NOISE_SYMBOLS = new Set(['ETF', 'US', 'HK', 'SH', 'SZ', 'CALL', 'PUT', 'PRO']);
  
  // First: look for "XX.US" or "XX.HK" pattern (Longbridge style)
  const dotMarketMatch = fullText.match(/\b([A-Z]{1,6})\.(US|HK|SH|SZ)\b/i);
  if (dotMarketMatch) {
    result.symbol = dotMarketMatch[1].toUpperCase();
  }
  
  // Second: look for standalone ticker on its own line
  if (!result.symbol) {
    for (const line of lines) {
      const cleaned = line.replace(/\s/g, '');
      // Pure uppercase ticker line (1-6 chars)
      if (/^[A-Z]{1,6}$/.test(cleaned) && !NOISE_SYMBOLS.has(cleaned)) {
        result.symbol = cleaned;
        break;
      }
    }
  }
  
  // Third: search within text for common patterns
  if (!result.symbol) {
    // Look for ticker after "名称代码" or "代码" label
    const codeMatch = fullText.match(/(?:名称代码|代码|股票代码)[\s:：]*(?:[^\s]*?)[\s]*([A-Z]{1,6})/i);
    if (codeMatch && !NOISE_SYMBOLS.has(codeMatch[1].toUpperCase())) {
      result.symbol = codeMatch[1].toUpperCase();
    }
  }
  
  // Fourth: any uppercase letter sequence that looks like a ticker
  if (!result.symbol) {
    const allTickers = [...fullText.matchAll(/\b([A-Z]{2,6})\b/g)]
      .map(m => m[1])
      .filter(t => !NOISE_SYMBOLS.has(t));
    if (allTickers.length > 0) {
      result.symbol = allTickers[0];
    }
  }

  // ──────────────────────────────────────────────
  // 3. Price (成交价/均价/订单价格)
  // ──────────────────────────────────────────────
  // Longbridge shows:  "订单数量/价格    2\n68.010"
  //                    "成交数量/均价    2\n68.010"
  //                    "订单价格  68.010"
  //                    "成交价格  68.010"
  
  const pricePatterns = [
    /(?:成交价|均价|成交均价|订单价格|成交价格|单价)[\s/]*[:：]?\s*(\d+\.?\d*)/,
    /(?:订单数量\/价格|成交数量\/均价)[\s\S]{0,20}?(\d+\.\d{2,})/,
    /(?:价格|Price)[\s:：]*(\d+\.?\d*)/i,
  ];
  
  for (const pattern of pricePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      result.price = parseFloat(match[1]);
      break;
    }
  }
  
  // Also try line-by-line for Longbridge's multiline format
  if (!result.price) {
    for (let i = 0; i < lines.length; i++) {
      if (/价格|均价|成交价/.test(lines[i])) {
        // Price might be on the same line or the next line
        const sameLine = lines[i].match(/(\d+\.\d{2,})/);
        if (sameLine) {
          result.price = parseFloat(sameLine[1]);
          break;
        }
        // Check next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].match(/(\d+\.\d{2,})/);
          if (nextLine) {
            result.price = parseFloat(nextLine[1]);
            break;
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // 4. Quantity (成交数量/股数/总数)
  // ──────────────────────────────────────────────
  const qtyPatterns = [
    /(?:成交数量|订单数量|数量|总数|股数|已成)[\s/]*[:：]?\s*(\d+)/,
    /(?:总数\/已成)[\s:：]*(\d+)/,
  ];
  
  for (const pattern of qtyPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      result.quantity = parseInt(match[1], 10);
      break;
    }
  }
  
  // Longbridge shows "总数/已成  2\n2" — try line-by-line
  if (!result.quantity) {
    for (let i = 0; i < lines.length; i++) {
      if (/数量|总数|已成/.test(lines[i])) {
        const sameLine = lines[i].match(/(\d+)\s*$/);
        if (sameLine) {
          result.quantity = parseInt(sameLine[1], 10);
          break;
        }
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].match(/^(\d+)/);
          if (nextLine) {
            result.quantity = parseInt(nextLine[1], 10);
            break;
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // 5. Asset Name (e.g. "Roundhill记忆ETF")
  // ──────────────────────────────────────────────
  const nameMatch = fullText.match(/(?:名称代码|名称)[\s:：]*([^\n]{2,20}?)(?:\s+[A-Z]|\s*$)/);
  if (nameMatch) {
    result.asset_name = nameMatch[1].trim();
  }

  // ──────────────────────────────────────────────
  // 6. Fallback: if no keyword-based extraction worked
  // ──────────────────────────────────────────────
  if (!result.price || !result.quantity) {
    // Collect all numbers from the text
    const allNumbers = [...fullText.matchAll(/\b(\d+\.?\d*)\b/g)]
      .map(m => parseFloat(m[1]))
      .filter(n => n > 0);
    
    const decimals = allNumbers.filter(n => !Number.isInteger(n));
    const smallIntegers = allNumbers.filter(n => Number.isInteger(n) && n <= 10000 && n > 0);
    
    if (!result.price && decimals.length > 0) {
      // Most likely the price is a decimal number
      result.price = decimals[0];
    }
    
    if (!result.quantity && smallIntegers.length > 0) {
      // Most likely quantity is a small integer
      result.quantity = smallIntegers[0];
    }
  }

  console.log('[OCR Extracted]:', result);
  return result;
}
