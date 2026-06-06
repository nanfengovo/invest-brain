import iconv from 'iconv-lite';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbols = searchParams.get('symbols');

    if (!symbols) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const apiUrl = `http://hq.sinajs.cn/list=${symbols}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Referer': 'http://finance.sina.com.cn'
      }
    });

    if (!response.ok) {
      throw new Error(`Sina API responded with status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const text = iconv.decode(Buffer.from(arrayBuffer), 'gbk');
    
    const lines = text.split('\n').filter(Boolean);
    const results = {};

    for (const line of lines) {
      const match = line.match(/var hq_str_([^=]+)="([^"]*)";/);
      if (match) {
        const symbol = match[1];
        const data = match[2].split(',');

        if (symbol.startsWith('gb_')) {
          // US Stock / ETF / Index format
          // 0: Name, 1: Price, 2: PctChange, 4: AbsChange, 26: PrevClose
          const price = parseFloat(data[1]);
          const pctChange = parseFloat(data[2]);
          const absChange = parseFloat(data[4]);
          const prevClose = parseFloat(data[26] || 0);

          results[symbol] = {
            symbol,
            name: data[0],
            price: isNaN(price) ? 0 : price,
            pctChange: isNaN(pctChange) ? 0 : pctChange,
            absChange: isNaN(absChange) ? 0 : absChange,
            prevClose: isNaN(prevClose) ? 0 : prevClose,
            type: 'us'
          };
        } else if (symbol.startsWith('hf_')) {
          // Global Futures format
          // 0: Price, 7: PrevClose, 13: Name
          const price = parseFloat(data[0]);
          const prevClose = parseFloat(data[7]);
          const absChange = price - prevClose;
          const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

          results[symbol] = {
            symbol,
            name: data[13] || symbol,
            price: isNaN(price) ? 0 : price,
            pctChange: isNaN(pctChange) ? 0 : pctChange,
            absChange: isNaN(absChange) ? 0 : absChange,
            prevClose: isNaN(prevClose) ? 0 : prevClose,
            type: 'futures'
          };
        } else if (symbol.startsWith('sh') || symbol.startsWith('sz')) {
          // A-Share format
          // 0: Name, 1: Open, 2: PrevClose, 3: Price
          const price = parseFloat(data[3]);
          const prevClose = parseFloat(data[2]);
          const absChange = price - prevClose;
          const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

          results[symbol] = {
            symbol,
            name: data[0],
            price: isNaN(price) ? 0 : price,
            pctChange: isNaN(pctChange) ? 0 : pctChange,
            absChange: isNaN(absChange) ? 0 : absChange,
            prevClose: isNaN(prevClose) ? 0 : prevClose,
            type: 'cn'
          };
        } else if (symbol.startsWith('hk')) {
          // HK Stock format
          // 0: English Name, 1: Name, 2: Open, 3: PrevClose, 4: High, 5: Low, 6: Price
          const price = parseFloat(data[6]);
          const prevClose = parseFloat(data[3]);
          const absChange = price - prevClose;
          const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

          results[symbol] = {
            symbol,
            name: data[1],
            price: isNaN(price) ? 0 : price,
            pctChange: isNaN(pctChange) ? 0 : pctChange,
            absChange: isNaN(absChange) ? 0 : absChange,
            prevClose: isNaN(prevClose) ? 0 : prevClose,
            type: 'hk'
          };
        }
      }
    }

    // Set CORS headers if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

    return res.status(200).json({ success: true, data: results });

  } catch (error) {
    console.error('Market Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
