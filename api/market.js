export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const symbolsArray = symbolsParam.split(',');
    const results = {};

    // Helper to map Sina-style symbols to Yahoo symbols
    const mapSymbol = (sym) => {
      let clean = sym.replace(/^(gb_|hf_|us|hk|sh|sz)/i, '').toUpperCase();
      if (clean === 'IXIC') return '^IXIC';
      if (clean === 'NDX') return '^NDX';
      if (clean === 'INX') return '^GSPC';
      if (clean === 'NQ') return 'NQ=F';
      if (clean === 'ES') return 'ES=F';
      if (clean === 'YM') return 'YM=F';
      if (clean === 'CL') return 'CL=F';
      return clean;
    };

    // We will do concurrent fetches using Yahoo Finance v8/finance/chart
    // This is much more reliable on Vercel Edge than Sina API
    const promises = symbolsArray.map(async (originalSymbol) => {
      const yfSymbol = mapSymbol(originalSymbol);
      try {
        const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=1d`;
        const response = await fetch(apiUrl);
        if (!response.ok) return; // Skip if failed

        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;
        
        if (meta) {
          const price = meta.regularMarketPrice || 0;
          const prevClose = meta.chartPreviousClose || 0;
          const absChange = price - prevClose;
          const pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : 0;

          results[originalSymbol] = {
            symbol: originalSymbol,
            name: meta.shortName || meta.longName || yfSymbol,
            price: price,
            pctChange: pctChange,
            absChange: absChange,
            prevClose: prevClose,
            type: originalSymbol.startsWith('hf_') ? 'futures' : 'us'
          };
        }
      } catch (err) {
        // silently ignore individual symbol failures
      }
    });

    await Promise.all(promises);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    return res.status(200).json({ success: true, data: results });

  } catch (error) {
    console.error('Market Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
