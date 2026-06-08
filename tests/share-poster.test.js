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
  assert.match(css, /560ms linear infinite/);
  assert.match(sectorGrid, /--market-row-index/);
  assert.match(watchlist, /--market-row-index/);
  assert.match(css, /background-color: rgba\(var\(--market-flash-up-rgb\)/);
  assert.match(css, /background-color: rgba\(var\(--market-flash-down-rgb\)/);
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
