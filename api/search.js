export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const q = searchParams.get('q');

    if (!q) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    const apiUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    
    // Add a basic User-Agent to avoid blocks
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Search API responded with status: ${response.status}`);
    }

    const data = await response.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    return res.status(200).json({ success: true, data: data.quotes || [] });

  } catch (error) {
    console.error('Search Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
