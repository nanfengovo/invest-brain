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
 * Parse an image for trade information.
 * Returns an ARRAY of detected trades (may contain 1 or more).
 * @param {File|Blob|string} image - The image to parse
 * @returns {Promise<Array<Object>>} Array of extracted trade data
 */
export async function parseTradeImage(image) {
  if (!initialized) {
    await initOcr();
  }

  const { data: { text } } = await worker.recognize(image);
  console.log('[OCR Raw Text]:', text);

  return {
    trades: extractMultipleTrades(text),
    candidates: extractCandidates(text),
  };
}

/**
 * Extract MULTIPLE trades from OCR text.
 * 
 * Longbridge list view format example:
 *   已成交或已撤单 (2)
 *   全部(2) 名称代码 订单价格 总数/已成
 *   买入   Roundhill记忆E...  68.010   2
 *   全部成交   DRAM.US                  2
 *   卖出   STM CALL           8.00     1
 *   全部成交   20260618 72.0            1
 *
 * Longbridge detail view format:
 *   交易详情
 *   交易方向   买入
 *   名称代码   Roundhill记忆ETF  DRAM
 *   订单数量/价格   2   68.010
 */
function extractMultipleTrades(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fullText = lines.join(' ');
  
  console.log('[OCR Lines]:', lines);

  // ── Strategy 1: Detect multiple trades by direction markers ──
  // Find all lines that start with or contain 买入/卖出
  const tradeBlocks = splitIntoTradeBlocks(lines);
  
  if (tradeBlocks.length > 0) {
    const trades = tradeBlocks.map(block => parseTradeBlock(block));
    const validTrades = trades.filter(t => t.symbol || t.price || t.quantity);
    if (validTrades.length > 0) {
      console.log('[OCR] Found multiple trade blocks:', validTrades);
      return validTrades;
    }
  }

  // ── Strategy 2: Single trade (detail view) ──
  const single = parseSingleTradeDetail(lines, fullText);
  if (single && (single.symbol || single.price)) {
    return [single];
  }

  // ── Strategy 3: Fallback ──
  const fallback = parseFallback(fullText);
  return fallback ? [fallback] : [];
}

/**
 * Split OCR lines into blocks, each block representing one trade.
 * A new block starts when we see 买入 or 卖出.
 */
function splitIntoTradeBlocks(lines) {
  const blocks = [];
  let currentBlock = null;
  
  for (const line of lines) {
    // Check if this line marks the start of a new trade
    const isDirection = /^(买入|卖出)/.test(line) || 
                        /^\s*(买入|卖出)\s/.test(line);
    
    if (isDirection) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { directionLine: line, extraLines: [] };
    } else if (currentBlock) {
      currentBlock.extraLines.push(line);
    }
  }
  
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

/**
 * Parse a single trade block from the list view.
 * 
 * Block structure (Longbridge):
 *   directionLine: "买入   Roundhill记忆E...  68.010   2"
 *   extraLines: ["全部成交   DRAM.US                  2"]
 */
function parseTradeBlock(block) {
  const result = {};
  const allText = [block.directionLine, ...block.extraLines].join(' ');
  
  // 1. Direction
  if (/买入/.test(block.directionLine)) result.direction = 'BUY';
  else if (/卖出/.test(block.directionLine)) result.direction = 'SELL';

  // 2. Symbol — look for TICKER.MARKET or standalone uppercase letters
  // Try XX.US / XX.HK pattern first
  const dotMatch = allText.match(/\b([A-Z]{1,6})\.(US|HK|SH|SZ)\b/i);
  if (dotMatch) {
    result.symbol = dotMatch[1].toUpperCase();
  }
  
  // Try standalone uppercase ticker (2-5 letters, not noise words)
  if (!result.symbol) {
    const NOISE = new Set(['ETF', 'US', 'HK', 'SH', 'SZ', 'CALL', 'PUT', 'PRO', 'ALL']);
    const tickers = [...allText.matchAll(/\b([A-Z]{2,6})\b/g)]
      .map(m => m[1])
      .filter(t => !NOISE.has(t));
    if (tickers.length > 0) result.symbol = tickers[0];
  }

  // 3. Detect if this is an option (contains CALL/PUT or date pattern like 20260618)
  const isOption = /CALL|PUT/i.test(allText);
  const expiryMatch = allText.match(/(\d{8})/);  // e.g. 20260618
  const strikeMatch = allText.match(/(?:CALL|PUT)\s*\n?\s*(\d{8})\s+(\d+\.?\d*)/i) ||
                      allText.match(/(\d{8})\s+(\d+\.?\d*)/);
  
  if (isOption) {
    result.asset_type = 'OPTION';
    result.option_type = /CALL/i.test(allText) ? 'CALL' : 'PUT';
    
    if (expiryMatch) {
      const ds = expiryMatch[1];
      result.expiry_date = `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    }
    if (strikeMatch) {
      result.strike_price = parseFloat(strikeMatch[2]);
    }
  }

  // 4. Price — look for decimal numbers in the trade line
  // In Longbridge list: "买入  Roundhill记忆E...  68.010  2"
  // The price is usually the decimal number
  const priceNumbers = [...allText.matchAll(/\b(\d+\.\d{2,3})\b/g)]
    .map(m => parseFloat(m[1]));
  
  if (priceNumbers.length > 0) {
    // Filter out strike prices we already captured
    const candidates = priceNumbers.filter(p => p !== result.strike_price);
    if (candidates.length > 0) {
      result.price = candidates[0];
    } else {
      result.price = priceNumbers[0];
    }
  }

  // 5. Quantity — look for small integers
  // In Longbridge: "总数/已成" column, or just standalone small numbers
  // The directionLine often ends with the quantity
  const qtyFromLabel = allText.match(/(?:总数|已成|数量)[\s/]*[:：]?\s*(\d+)/);
  if (qtyFromLabel) {
    result.quantity = parseInt(qtyFromLabel[1], 10);
  }
  
  if (!result.quantity) {
    // Get all integers from the text, excluding years (2020-2030) and dates (8-digit)
    const allInts = [...allText.matchAll(/\b(\d{1,4})\b/g)]
      .map(m => parseInt(m[1], 10))
      .filter(n => n > 0 && n < 10000);
    
    // Remove price-related numbers  
    const filtered = allInts.filter(n => {
      if (result.price && Math.abs(n - result.price) < 0.01) return false;
      if (result.strike_price && Math.abs(n - result.strike_price) < 0.01) return false;
      return true;
    });
    
    // The quantity is usually a small number (1-1000)
    const smallInts = filtered.filter(n => n >= 1 && n <= 1000);
    if (smallInts.length > 0) {
      result.quantity = smallInts[0];
    }
  }

  console.log('[OCR TradeBlock]:', result);
  return result;
}

/**
 * Parse single trade from Longbridge detail view.
 */
function parseSingleTradeDetail(lines, fullText) {
  const result = {};

  // Direction
  if (/买入/.test(fullText)) result.direction = 'BUY';
  else if (/卖出/.test(fullText)) result.direction = 'SELL';

  // Symbol
  const dotMatch = fullText.match(/\b([A-Z]{1,6})\.(US|HK|SH|SZ)\b/i);
  if (dotMatch) result.symbol = dotMatch[1].toUpperCase();
  
  if (!result.symbol) {
    const NOISE = new Set(['ETF', 'US', 'HK', 'SH', 'SZ', 'CALL', 'PUT', 'PRO']);
    for (const line of lines) {
      const cleaned = line.replace(/\s/g, '');
      if (/^[A-Z]{2,6}$/.test(cleaned) && !NOISE.has(cleaned)) {
        result.symbol = cleaned;
        break;
      }
    }
  }

  if (!result.symbol) {
    const codeMatch = fullText.match(/(?:名称代码|代码)[\s\S]{0,30}?([A-Z]{2,6})/);
    if (codeMatch) result.symbol = codeMatch[1];
  }

  // Price — keyword-based
  const pricePatterns = [
    /(?:成交价|均价|成交均价|订单价格|成交价格)[\s/:：]*(\d+\.?\d*)/,
    /(?:订单数量\/价格|成交数量\/均价)[\s\S]{0,30}?(\d+\.\d{2,})/,
    /(?:价格)[\s:：]*(\d+\.?\d*)/,
  ];
  for (const p of pricePatterns) {
    const m = fullText.match(p);
    if (m) { result.price = parseFloat(m[1]); break; }
  }

  // Quantity — keyword-based
  const qtyPatterns = [
    /(?:成交数量|订单数量|数量|总数|已成)[\s/:：]*(\d+)/,
  ];
  for (const p of qtyPatterns) {
    const m = fullText.match(p);
    if (m) { result.quantity = parseInt(m[1], 10); break; }
  }

  return result;
}

/**
 * Last-resort fallback extraction.
 */
function parseFallback(text) {
  const result = {};
  
  if (/买入|buy/i.test(text)) result.direction = 'BUY';
  else if (/卖出|sell/i.test(text)) result.direction = 'SELL';

  const tickers = [...text.matchAll(/\b([A-Z]{2,6})\b/g)].map(m => m[1]);
  const NOISE = new Set(['ETF', 'US', 'HK', 'CALL', 'PUT', 'PRO']);
  const validTickers = tickers.filter(t => !NOISE.has(t));
  if (validTickers.length > 0) result.symbol = validTickers[0];

  const decimals = [...text.matchAll(/\b(\d+\.\d{2,})\b/g)].map(m => parseFloat(m[1]));
  if (decimals.length > 0) result.price = decimals[0];

  const ints = [...text.matchAll(/\b(\d{1,4})\b/g)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n > 0 && n <= 10000);
  if (ints.length > 0) result.quantity = ints[0];

  return (result.symbol || result.price) ? result : null;
}

/**
 * Extract smart suggestions pools (ammunition for the UI).
 * Grabs all possible symbols and numbers regardless of layout.
 */
function extractCandidates(text) {
  const rawClean = text.replace(/,/g, ''); // Remove commas from numbers
  
  // 1. Symbols: all uppercase letter combinations 2-6 chars long
  const NOISE = new Set(['ETF', 'US', 'HK', 'SH', 'SZ', 'CALL', 'PUT', 'PRO', 'ALL', 'THE']);
  const allSymbols = [...text.matchAll(/\b([A-Z]{2,6})\b/g)]
    .map(m => m[1])
    .filter(t => !NOISE.has(t));
  
  // Also try to find explicit broker symbols like DRAM.US
  const dotSymbols = [...text.matchAll(/\b([A-Z]{1,6}\.(US|HK|SH|SZ))\b/gi)]
    .map(m => m[1].toUpperCase());

  // 2. Numbers: match anything that looks like a price, quantity, or strike price
  const allNumbers = [...rawClean.matchAll(/\b(\d+(\.\d+)?)\b/g)]
    .map(m => m[1]);

  return {
    symbols: [...new Set([...dotSymbols, ...allSymbols])], // Deduplicate
    numbers: [...new Set(allNumbers)],
  };
}
