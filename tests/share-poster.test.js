import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('share poster utility creates local PNG posters and recommends free-ish model paths', () => {
  const source = readFileSync(new URL('../src/utils/sharePoster.js', import.meta.url), 'utf8');

  assert.match(source, /POSTER_WIDTH = 1080/);
  assert.match(source, /POSTER_HEIGHT = 1440/);
  assert.match(source, /canvas\.toDataURL\('image\/png'/);
  assert.match(source, /dataUrlToBlob/);
  assert.match(source, /navigator\.canShare/);
  assert.match(source, /FREE_IMAGE_MODEL_RECOMMENDATIONS/);
  assert.match(source, /Qwen-Image/);
  assert.match(source, /qwen-image-2512/);
  assert.match(source, /FLUX\.1-schnell/);
  assert.match(source, /flux\.2-klein-4b/);
  assert.match(source, /chooseSharePosterBackground/);
  assert.match(source, /drawPosterBackground/);
  assert.match(source, /TEMPLATE_POOL/);
  assert.match(source, /drawBadgeTemplate/);
  assert.match(source, /drawLedgerTemplate/);
  assert.match(source, /drawPopProfitTemplate/);
  assert.match(source, /pickTemplate/);
});

test('market trade decision and information modules expose share poster actions', () => {
  const market = readFileSync(new URL('../src/pages/MarketPage.jsx', import.meta.url), 'utf8');
  const trade = readFileSync(new URL('../src/components/Trade/TradeCard.jsx', import.meta.url), 'utf8');
  const decision = readFileSync(new URL('../src/components/Decision/DecisionCard.jsx', import.meta.url), 'utf8');
  const information = readFileSync(new URL('../src/pages/InformationDetail.jsx', import.meta.url), 'utf8');

  assert.match(market, /sharePoster/);
  assert.match(market, /市场行情快照/);
  assert.match(trade, /生成分享图/);
  assert.match(trade, /handleSharePoster/);
  assert.match(decision, /生成分享图/);
  assert.match(decision, /期权归因/);
  assert.match(information, /handleShareInformationPoster/);
  assert.match(information, />分享图</);
  assert.match(information, /buildPosterSummaryText/);
  assert.match(information, /title: posterTitle/);
  assert.match(information, /summary: posterSummary/);
});

test('market boards expose high-frequency refresh and directional background motion', () => {
  const market = readFileSync(new URL('../src/pages/MarketPage.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/MarketPage.css', import.meta.url), 'utf8');
  const sectorGrid = readFileSync(new URL('../src/components/Market/SectorGrid.jsx', import.meta.url), 'utf8');
  const watchlist = readFileSync(new URL('../src/components/Market/WatchlistBoard.jsx', import.meta.url), 'utf8');

  assert.match(market, /marketRefreshing/);
  assert.match(market, /refreshing=\{marketRefreshing\}/);
  assert.match(sectorGrid, /refreshing = false/);
  assert.match(watchlist, /refreshing = false/);
  assert.match(css, /market-board--refreshing::before/);
  assert.match(css, /market-board-scan/);
  assert.match(css, /market-row-wash-up/);
  assert.match(css, /market-row-wash-down/);
  assert.match(css, /market-number-pop-up/);
  assert.match(css, /market-number-pop-down/);
  assert.match(css, /market-live-board-scan/);
  assert.match(css, /market-live-row-spark/);
  assert.match(css, /market-live-number-tick/);
  assert.match(css, /market-change-rise-pulse/);
  assert.match(css, /market-change-fall-pulse/);
  assert.match(css, /460ms cubic-bezier/);
  assert.match(css, /560ms linear infinite/);
  assert.match(sectorGrid, /market-change--up/);
  assert.match(watchlist, /market-change--down/);
  assert.match(sectorGrid, /--market-row-index/);
  assert.match(watchlist, /--market-row-index/);
  assert.match(css, /background-color: rgba\(var\(--market-flash-up-rgb\)/);
  assert.match(css, /background-color: rgba\(var\(--market-flash-down-rgb\)/);
});

test('market default spotlight shows stock prices instead of index points', () => {
  const market = readFileSync(new URL('../src/pages/MarketPage.jsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/components/Market/MarketHeader.jsx', import.meta.url), 'utf8');

  assert.match(market, /const DEFAULT_STOCKS = \[/);
  assert.match(market, /symbol: 'NVDA'/);
  assert.match(market, /symbol: 'AAPL'/);
  assert.match(market, /symbol: 'TSLA'/);
  assert.match(market, /hasWatchlist \? marketWatchlist : DEFAULT_STOCKS/);
  assert.match(market, /variant=\{hasWatchlist \? 'watchlist' : 'spotlight'\}/);
  assert.match(market, /热门美股股价/);
  assert.match(header, /热门美股实时股价/);
  assert.doesNotMatch(market, /const INDICES = \[/);
  assert.doesNotMatch(market, /gb_ixic/);
  assert.doesNotMatch(market, /全球主要指数/);
});

test('market option section uses contract monitor cards instead of generic quote tiles', () => {
  const market = readFileSync(new URL('../src/pages/MarketPage.jsx', import.meta.url), 'utf8');
  const optionStrip = readFileSync(new URL('../src/components/Market/OptionMonitorStrip.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/MarketPage.css', import.meta.url), 'utf8');

  assert.match(market, /import OptionMonitorStrip/);
  assert.match(market, /<OptionMonitorStrip/);
  assert.match(market, /underlyingQuotes=\{marketData\}/);
  assert.match(market, /optionUnderlyingSymbols/);
  assert.doesNotMatch(market, /variant="options"/);
  assert.match(optionStrip, /getDteMonitor/);
  assert.match(optionStrip, /getMoneynessMonitor/);
  assert.match(optionStrip, /期权报价未返回/);
  assert.match(optionStrip, /行权/);
  assert.match(css, /market-option-card__moneyness--itm/);
  assert.match(css, /market-option-card__dte/);
});

test('market data settings support MarketData.app option provider', () => {
  const api = readFileSync(new URL('../api/options-chain.js', import.meta.url), 'utf8');
  const stockSnapshot = readFileSync(new URL('../api/stock-snapshot.js', import.meta.url), 'utf8');
  const longbridge = readFileSync(new URL('../api/_lib/longbridge.js', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/pages/SettingsPage.jsx', import.meta.url), 'utf8');
  const appStore = readFileSync(new URL('../src/stores/useAppStore.js', import.meta.url), 'utf8');
  const alertRules = readFileSync(new URL('../api/_lib/alertRules.js', import.meta.url), 'utf8');
  const cloudAlerts = readFileSync(new URL('../src/utils/cloudAlerts.js', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../src/pages/MarketPage.jsx', import.meta.url), 'utf8');
  const stockDetail = readFileSync(new URL('../src/pages/StockDetailPage.jsx', import.meta.url), 'utf8');
  const holdings = readFileSync(new URL('../src/pages/HoldingsPage.jsx', import.meta.url), 'utf8');
  const holdingCard = readFileSync(new URL('../src/components/Holdings/HoldingCard.jsx', import.meta.url), 'utf8');
  const glossary = readFileSync(new URL('../src/utils/marketFieldGlossary.js', import.meta.url), 'utf8');
  const priceAlertRunner = readFileSync(new URL('../src/utils/priceAlertRunner.js', import.meta.url), 'utf8');
  const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

  assert.match(api, /fetchMarketDataApp/);
  assert.match(api, /api\.marketdata\.app\/v1\/options\/quotes/);
  assert.match(api, /api\.marketdata\.app\/v1\/options\/chain/);
  assert.match(api, /MARKETDATA_TOKEN/);
  assert.match(api, /MarketData\.app/);
  assert.match(api, /status === 203/);
  assert.match(api, /fetchLongbridge/);
  assert.match(api, /provider === 'longbridge'/);
  assert.match(stockSnapshot, /fetchLongbridgeStockSnapshot/);
  assert.match(stockSnapshot, /buildLongbridgeFallbackSnapshot/);
  assert.match(stockSnapshot, /company/);
  assert.match(stockSnapshot, /industryRank/);
  assert.match(longbridge, /QuoteContext/);
  assert.match(longbridge, /staticInfo/);
  assert.match(longbridge, /optionQuote/);
  assert.match(longbridge, /toLongbridgeOptionSymbol/);
  assert.match(settings, /MarketData\.app/);
  assert.match(settings, /免费层约 100 次\/日 API Credits/);
  assert.match(settings, /期权数据延迟约 24h/);
  assert.match(settings, /MarketData\.app Token（推荐）/);
  assert.match(settings, /Longbridge/);
  assert.match(settings, /Longbridge App Key/);
  assert.match(appStore, /marketDataToken/);
  assert.match(appStore, /longbridgeAppKey/);
  assert.match(alertRules, /marketDataToken/);
  assert.match(alertRules, /longbridgeAccessToken/);
  assert.match(alertRules, /'marketdata'/);
  assert.match(cloudAlerts, /marketDataToken/);
  assert.match(cloudAlerts, /longbridgeAccessToken/);
  assert.match(market, /X-MarketData-Token/);
  assert.match(market, /X-Longbridge-App-Key/);
  assert.match(market, /params\.set\('contract'/);
  assert.match(stockDetail, /X-MarketData-Token/);
  assert.match(stockDetail, /X-Longbridge-App-Key/);
  assert.match(stockDetail, /公司情报/);
  assert.match(stockDetail, /期权字段解释/);
  assert.match(stockDetail, /stock-detail__mode-switch/);
  assert.match(stockDetail, /getFieldHelp/);
  assert.match(holdings, /\/api\/options-chain/);
  assert.match(holdings, /optionQuote=\{optionQuotes\[holdingKey\]\}/);
  assert.match(holdingCard, /liveOptionPrice/);
  assert.match(holdingCard, /unrealizedPnl/);
  assert.match(holdingCard, /Mark/);
  assert.match(glossary, /OPTION_FIELD_HELP/);
  assert.match(glossary, /theta/);
  assert.match(glossary, /vega/);
  assert.match(glossary, /floatMarketCap/);
  assert.match(priceAlertRunner, /X-MarketData-Token/);
  assert.match(priceAlertRunner, /contract: alert\.asset_id/);
  assert.match(priceAlertRunner, /X-Longbridge-Access-Token/);
  assert.match(viteConfig, /\/api\/options-chain/);
  assert.match(viteConfig, /\/api\/stock-snapshot/);
});

test('share poster background picker supports local upload and NVIDIA generation', () => {
  const picker = readFileSync(new URL('../src/utils/sharePosterBackgrounds.jsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../api/_lib/shareBackground.js', import.meta.url), 'utf8');
  const summarize = readFileSync(new URL('../api/summarize.js', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/pages/SettingsPage.jsx', import.meta.url), 'utf8');
  const appStore = readFileSync(new URL('../src/stores/useAppStore.js', import.meta.url), 'utf8');
  const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const vercelConfig = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  const apiFunctions = readdirSync(new URL('../api', import.meta.url))
    .filter((file) => file.endsWith('.js'));

  assert.match(picker, /选择本地背景/);
  assert.match(picker, /使用我的图片/);
  assert.match(picker, /收益勋章/);
  assert.match(picker, /红色战报/);
  assert.match(picker, /NVIDIA AI 生成/);
  assert.match(picker, /mode: 'share-background'/);
  assert.match(picker, /qwen-image-2512/);
  assert.match(picker, /flux\.2-klein-4b/);
  assert.match(api, /integrate\.api\.nvidia\.com\/v1/);
  assert.match(api, /\$\{baseUrl\}\/images\/generations/);
  assert.match(api, /NVIDIA_IMAGE_BASE_URL/);
  assert.match(summarize, /mode === 'share-background'/);
  assert.match(summarize, /NVIDIA_API_KEY/);
  assert.match(summarize, /x-nvidia-api-key/);
  assert.match(settings, /分享图背景生成/);
  assert.match(settings, /NVIDIA API Key/);
  assert.match(appStore, /share_background_config/);
  assert.match(viteConfig, /\/api\/share-background/);
  assert.match(vercelConfig, /"source": "\/api\/share-background"/);
  assert.ok(apiFunctions.length <= 12, `Vercel Hobby allows at most 12 Serverless Functions, found ${apiFunctions.length}`);
});
