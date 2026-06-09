import { chooseSharePosterBackground } from './sharePosterBackgrounds.jsx';

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;
const POSTER_PADDING = 72;
const SHARE_BRAND = 'InvestBrain';
const TEMPLATE_POOL = ['signal-card', 'badge-card', 'ledger-clean', 'pop-profit'];

function getCanvasScale() {
  if (typeof window === 'undefined') return 2;
  return Math.min(3, Math.max(2, window.devicePixelRatio || 2));
}

function normalizeLines(value, limit = 4) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit);
  }
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function clampText(ctx, text, maxWidth, maxLines = 2) {
  const input = String(text || '').trim();
  if (!input) return [];

  const chars = [...input];
  const lines = [];
  let current = '';

  chars.forEach((char) => {
    const next = current + char;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = char;
  });

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const sliced = lines.slice(0, maxLines);
  let last = sliced[sliced.length - 1] || '';
  while (last && ctx.measureText(`${last}...`).width > maxWidth) {
    last = last.slice(0, -1);
  }
  sliced[sliced.length - 1] = `${last}...`;
  return sliced;
}

function stripPosterText(value = '') {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashString(value = '') {
  return [...String(value || '')].reduce((hash, char) => {
    const next = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(next);
  }, 23);
}

function pickTemplate(config = {}) {
  const explicit = String(config.template || config.posterStyle || '').trim();
  if (TEMPLATE_POOL.includes(explicit)) return explicit;

  const type = String(config.typeLabel || '').toLowerCase();
  const hasProfitLoss = (config.metrics || []).some((metric) => ['profit', 'loss'].includes(metric?.tone));
  const seed = `${config.title || ''}|${config.subtitle || ''}|${Date.now()}|${Math.random()}`;
  const choose = (pool) => pool[hashString(seed) % pool.length];

  if (type.includes('行情')) return choose(['badge-card', 'signal-card', 'ledger-clean']);
  if (type.includes('交易') || type.includes('复盘') || type.includes('决策')) {
    return hasProfitLoss ? choose(['pop-profit', 'ledger-clean', 'signal-card']) : choose(['signal-card', 'ledger-clean', 'badge-card']);
  }
  if (type.includes('文章') || type.includes('情报') || type.includes('视频') || type.includes('图片') || type.includes('书籍')) {
    return choose(['signal-card', 'ledger-clean', 'badge-card']);
  }
  return choose(TEMPLATE_POOL);
}

function getPosterSummary(config = {}, fallbackLines = []) {
  const summary = stripPosterText(config.summary || config.description || '');
  if (summary) return summary;
  return stripPosterText(normalizeLines(fallbackLines, 3).join(' '));
}

function getMainMetric(config = {}) {
  if (config.mainMetric?.value) return config.mainMetric;
  const metrics = Array.isArray(config.metrics) ? config.metrics : [];
  return metrics.find((metric) => ['profit', 'loss'].includes(metric?.tone)) || metrics[0] || null;
}

function setFittedFont(ctx, text, maxWidth, {
  size = 46,
  min = 24,
  weight = 800,
  family = '"DIN Alternate", "PingFang SC", sans-serif',
} = {}) {
  let nextSize = size;
  do {
    ctx.font = `${weight} ${nextSize}px ${family}`;
    if (ctx.measureText(String(text || '')).width <= maxWidth) break;
    nextSize -= 2;
  } while (nextSize > min);
  return nextSize;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawTextLines(ctx, lines, x, y, lineHeight, maxWidth, maxLines) {
  const rendered = clampText(ctx, lines.join(' '), maxWidth, maxLines);
  rendered.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return y + rendered.length * lineHeight;
}

function drawMetricCard(ctx, metric, x, y, width, height, accent) {
  ctx.save();
  roundRect(ctx, x, y, width, height, 28);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.56)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
  ctx.font = '500 28px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(metric.label, x + 28, y + 44);

  ctx.fillStyle = metric.tone === 'loss' ? '#fb7185' : metric.tone === 'profit' ? '#2dd4bf' : accent;
  setFittedFont(ctx, metric.value || '--', width - 56, { size: 46, min: 28 });
  ctx.fillText(String(metric.value || '--'), x + 28, y + 96);

  if (metric.hint) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.58)';
    ctx.font = '500 23px "PingFang SC", sans-serif';
    ctx.fillText(String(metric.hint), x + 28, y + height - 26);
  }
  ctx.restore();
}

function drawPosterBackground(ctx, config, accent, accent2) {
  const background = config.background || null;

  if (background?.image instanceof HTMLImageElement) {
    const img = background.image;
    const scale = Math.max(POSTER_WIDTH / img.naturalWidth, POSTER_HEIGHT / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    ctx.drawImage(img, (POSTER_WIDTH - width) / 2, (POSTER_HEIGHT - height) / 2, width, height);

    const shade = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
    shade.addColorStop(0, 'rgba(2, 6, 23, 0.28)');
    shade.addColorStop(0.48, 'rgba(2, 6, 23, 0.58)');
    shade.addColorStop(1, 'rgba(2, 6, 23, 0.82)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    return;
  }

  const bg = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  bg.addColorStop(0, background?.palette?.[0] || '#07111f');
  bg.addColorStop(0.46, background?.palette?.[1] || '#111827');
  bg.addColorStop(1, background?.palette?.[2] || '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const glow = ctx.createRadialGradient(190, 160, 0, 190, 160, 520);
  glow.addColorStop(0, `${background?.accent || accent}66`);
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const glow2 = ctx.createRadialGradient(940, 1060, 0, 940, 1060, 620);
  glow2.addColorStop(0, `${background?.accent2 || accent2}38`);
  glow2.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  if (background?.pattern === 'grid' || background?.pattern === 'orbital') {
    ctx.save();
    ctx.globalAlpha = background.pattern === 'orbital' ? 0.18 : 0.12;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = 1;
    for (let x = -40; x < POSTER_WIDTH + 80; x += 72) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 180, POSTER_HEIGHT);
      ctx.stroke();
    }
    for (let y = 80; y < POSTER_HEIGHT; y += 96) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(POSTER_WIDTH, y - 160);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (background?.pattern === 'orbital') {
    ctx.save();
    ctx.strokeStyle = `${background?.accent2 || accent2}40`;
    ctx.lineWidth = 2;
    [420, 560, 720].forEach((radius, index) => {
      ctx.beginPath();
      ctx.ellipse(POSTER_WIDTH * 0.72, POSTER_HEIGHT * 0.3, radius, radius * 0.42, -0.35 + index * 0.1, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }
}

function drawFooter(ctx, config, theme = {}) {
  const x = theme.x || POSTER_PADDING + 44;
  const y = theme.y || POSTER_HEIGHT - 138;
  ctx.fillStyle = theme.color || 'rgba(148, 163, 184, 0.62)';
  ctx.font = '500 24px "PingFang SC", sans-serif';
  ctx.fillText(config.footer || '本地优先 · 交易记录与分析 Agent', x, y);

  ctx.fillStyle = theme.dateColor || 'rgba(148, 163, 184, 0.45)';
  ctx.font = '500 22px "PingFang SC", sans-serif';
  ctx.fillText(config.generatedAt || new Date().toLocaleString('zh-CN'), x, y + 36);
}

function drawSignalCardTemplate(ctx, config, accent, accent2) {
  const typeLabel = config.typeLabel || '分享图';
  const metrics = Array.isArray(config.metrics) ? config.metrics.slice(0, 4) : [];
  const highlights = normalizeLines(config.highlights, 5).map(stripPosterText).filter(Boolean);
  const summary = getPosterSummary(config, highlights);

  drawPosterBackground(ctx, config, accent, accent2);

  ctx.save();
  roundRect(ctx, POSTER_PADDING, 74, POSTER_WIDTH - POSTER_PADDING * 2, POSTER_HEIGHT - 148, 44);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.66)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
  ctx.font = '700 28px "PingFang SC", sans-serif';
  ctx.fillText(SHARE_BRAND, POSTER_PADDING + 44, 138);

  ctx.save();
  roundRect(ctx, POSTER_WIDTH - POSTER_PADDING - 204, 106, 160, 48, 999);
  ctx.fillStyle = `${accent}24`;
  ctx.fill();
  ctx.strokeStyle = `${accent}80`;
  ctx.stroke();
  ctx.fillStyle = '#dbeafe';
  ctx.font = '700 24px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(typeLabel, POSTER_WIDTH - POSTER_PADDING - 124, 138);
  ctx.restore();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 66px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const titleLines = clampText(ctx, config.title || '投资分享图', POSTER_WIDTH - POSTER_PADDING * 2 - 88, 2);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, POSTER_PADDING + 44, 244 + index * 76);
  });

  ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
  ctx.font = '500 28px "PingFang SC", sans-serif';
  drawTextLines(
    ctx,
    normalizeLines(config.subtitle || new Date().toLocaleString('zh-CN'), 2),
    POSTER_PADDING + 44,
    392,
    42,
    POSTER_WIDTH - POSTER_PADDING * 2 - 88,
    2,
  );

  let y = 476;
  if (metrics.length > 0) {
    const gap = 18;
    const cardWidth = metrics.length === 1
      ? POSTER_WIDTH - POSTER_PADDING * 2 - 88
      : (POSTER_WIDTH - POSTER_PADDING * 2 - 88 - gap) / 2;
    metrics.forEach((metric, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      drawMetricCard(
        ctx,
        metric,
        POSTER_PADDING + 44 + col * (cardWidth + gap),
        y + row * 154,
        cardWidth,
        132,
        accent,
      );
    });
    y += Math.ceil(metrics.length / 2) * 154 + 32;
  }

  if (summary) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 34px "PingFang SC", sans-serif';
    ctx.fillText(config.sectionTitle || '信息摘要', POSTER_PADDING + 44, y + 34);
    y += 76;

    ctx.fillStyle = accent2;
    ctx.beginPath();
    ctx.arc(POSTER_PADDING + 56, y - 9, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
    ctx.font = '600 30px "PingFang SC", "Noto Sans CJK SC", sans-serif';
    const lines = clampText(ctx, summary, POSTER_WIDTH - POSTER_PADDING * 2 - 122, 4);
    lines.forEach((line, index) => {
      ctx.fillText(line, POSTER_PADDING + 80, y + index * 42);
    });
  }

  drawFooter(ctx, config);
}

function drawBadgeIcon(ctx, x, y, radius, accent, accent2) {
  ctx.save();
  const gold = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  gold.addColorStop(0, '#fff7cc');
  gold.addColorStop(0.46, '#facc15');
  gold.addColorStop(1, '#b45309');
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? radius : radius * 0.84;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fill();

  ctx.fillStyle = '#fff7ed';
  ctx.font = '900 74px "DIN Alternate", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IB', x, y + 24);

  ['#ef4444', '#facc15', '#3b82f6', '#ffffff', accent2].forEach((color, index) => {
    const angle = index * 1.18 + 0.2;
    ctx.save();
    ctx.translate(x + Math.cos(angle) * radius * 1.42, y + Math.sin(angle) * radius * 1.08);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-10, -20, 20, 40);
    ctx.restore();
  });
  ctx.restore();
}

function drawBadgeTemplate(ctx, config, accent, accent2) {
  const bg = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
  bg.addColorStop(0, '#06111f');
  bg.addColorStop(0.54, '#0f2c44');
  bg.addColorStop(1, '#1f4c68');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const glow = ctx.createRadialGradient(POSTER_WIDTH / 2, 340, 0, POSTER_WIDTH / 2, 340, 480);
  glow.addColorStop(0, `${accent}44`);
  glow.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = '800 34px "PingFang SC", sans-serif';
  ctx.fillText(SHARE_BRAND, 92, 112);

  ctx.save();
  roundRect(ctx, POSTER_WIDTH - 220, 78, 128, 42, 999);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 21px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(config.typeLabel || '分享图', POSTER_WIDTH - 156, 106);
  ctx.restore();

  drawBadgeIcon(ctx, POSTER_WIDTH / 2, 398, 172, accent, accent2);

  ctx.fillStyle = accent;
  ctx.font = '900 52px "PingFang SC", sans-serif';
  ctx.fillText(config.badgeKicker || '值得记录', 92, 760);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const titleLines = clampText(ctx, config.title || '投资分享图', POSTER_WIDTH - 184, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, 92, 842 + index * 68));

  const summary = getPosterSummary(config, config.highlights);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.74)';
  ctx.font = '500 32px "PingFang SC", sans-serif';
  const summaryLines = clampText(ctx, summary || config.subtitle || '', POSTER_WIDTH - 184, 3);
  summaryLines.forEach((line, index) => ctx.fillText(line, 92, 1008 + index * 48));

  const mainMetric = getMainMetric(config);
  if (mainMetric) {
    ctx.save();
    roundRect(ctx, 92, 1190, POSTER_WIDTH - 184, 92, 999);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, `${mainMetric.label || '指标'}：${mainMetric.value}`, POSTER_WIDTH - 260, { size: 34, min: 24 });
    ctx.textAlign = 'center';
    ctx.fillText(`${mainMetric.label || '指标'}：${mainMetric.value}`, POSTER_WIDTH / 2, 1248);
    ctx.restore();
  }

  drawFooter(ctx, config, { color: 'rgba(226, 232, 240, 0.58)', dateColor: 'rgba(226, 232, 240, 0.42)' });
}

function drawLedgerTemplate(ctx, config, accent, accent2) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  ctx.fillStyle = '#111827';
  ctx.font = '900 44px "PingFang SC", sans-serif';
  ctx.fillText(config.author || SHARE_BRAND, 138, 112);

  ctx.fillStyle = '#6b7280';
  ctx.font = '500 28px "PingFang SC", sans-serif';
  ctx.fillText(config.generatedAt || new Date().toLocaleString('zh-CN'), 138, 156);

  ctx.save();
  roundRect(ctx, 92, 188, POSTER_WIDTH - 184, 54, 0);
  ctx.fillStyle = '#f3f4f6';
  ctx.fill();
  ctx.fillStyle = '#6b7280';
  ctx.font = '500 25px "PingFang SC", sans-serif';
  ctx.fillText(`${config.typeLabel || '情报'} · ${config.subtitle || '本地账本'}`, 118, 224);
  ctx.restore();

  const mainMetric = getMainMetric(config);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b8b8b';
  ctx.font = '500 31px "PingFang SC", sans-serif';
  ctx.fillText(mainMetric?.label || config.sectionTitle || '核心摘要', POSTER_WIDTH / 2, 450);

  ctx.fillStyle = mainMetric?.tone === 'loss' ? '#16a34a' : '#f97316';
  setFittedFont(ctx, mainMetric?.value || config.title || '已沉淀', POSTER_WIDTH - 180, { size: 92, min: 48, weight: 900 });
  ctx.fillText(mainMetric?.value || config.title || '已沉淀', POSTER_WIDTH / 2, 560);

  ctx.textAlign = 'left';
  const panelY = 720;
  const panelH = 360;
  ctx.save();
  roundRect(ctx, 92, panelY, POSTER_WIDTH - 184, panelH, 14);
  ctx.fillStyle = '#fff7ed';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#111827';
  ctx.font = '900 34px "PingFang SC", sans-serif';
  ctx.fillText(config.sectionTitle || '信息摘要', 126, panelY + 58);

  const summary = getPosterSummary(config, config.highlights);
  ctx.fillStyle = '#374151';
  ctx.font = '600 30px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  clampText(ctx, summary || config.title || '', POSTER_WIDTH - 252, 5)
    .forEach((line, index) => ctx.fillText(line, 126, panelY + 116 + index * 46));

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 1186);
  ctx.lineTo(POSTER_WIDTH - 72, 1186);
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = '900 34px "PingFang SC", sans-serif';
  ctx.fillText(SHARE_BRAND, 132, 1306);
  ctx.fillStyle = '#111827';
  ctx.font = '700 28px "PingFang SC", sans-serif';
  ctx.fillText('交易记录与分析 Agent', POSTER_WIDTH - 380, 1288);
  ctx.fillText('本地优先', POSTER_WIDTH - 380, 1330);
}

function drawPopProfitTemplate(ctx, config, accent, accent2) {
  const red = config.accent || '#f43f5e';
  const bg = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
  bg.addColorStop(0, red);
  bg.addColorStop(1, '#e11d48');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '900 40px "PingFang SC", sans-serif';
  ctx.fillText(SHARE_BRAND, 74, 112);
  ctx.font = '500 24px "PingFang SC", sans-serif';
  ctx.fillText('Local-first Trading Agent', 78, 146);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.font = '500 36px "PingFang SC", sans-serif';
  ctx.fillText(config.slogan || '今日复盘，落袋为安', POSTER_WIDTH / 2, 248);

  ctx.save();
  ctx.translate(POSTER_WIDTH / 2, 520);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.arc(0, 0, 216, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 170px "PingFang SC", sans-serif';
  ctx.fillText('IB', 0, 54);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.54)';
  ctx.font = '700 34px "PingFang SC", sans-serif';
  ctx.fillText(config.typeLabel || '分享图', 0, 118);
  ctx.restore();

  const mainMetric = getMainMetric(config);
  ctx.save();
  roundRect(ctx, POSTER_WIDTH / 2 - 92, 820, 184, 48, 8);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px "PingFang SC", sans-serif';
  ctx.fillText(mainMetric?.label || '核心指标', POSTER_WIDTH / 2, 854);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  setFittedFont(ctx, mainMetric?.value || config.title || '+0.00%', POSTER_WIDTH - 164, { size: 96, min: 48, weight: 900 });
  ctx.fillText(mainMetric?.value || config.title || '+0.00%', POSTER_WIDTH / 2, 970);

  const metrics = Array.isArray(config.metrics) ? config.metrics.slice(0, 3) : [];
  ctx.textAlign = 'left';
  metrics.forEach((metric, index) => {
    const x = 78 + index * 318;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '500 28px "PingFang SC", sans-serif';
    ctx.fillText(metric.label || '--', x, 1130);
    ctx.fillStyle = '#ffffff';
    setFittedFont(ctx, metric.value || '--', 270, { size: 36, min: 24, weight: 800 });
    ctx.fillText(String(metric.value || '--'), x, 1180);
  });

  const summary = getPosterSummary(config, config.highlights);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '500 27px "PingFang SC", sans-serif';
  clampText(ctx, summary || config.subtitle || '', POSTER_WIDTH - 156, 2)
    .forEach((line, index) => ctx.fillText(line, 78, 1264 + index * 40));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '500 24px "PingFang SC", sans-serif';
  ctx.fillText(config.generatedAt || new Date().toLocaleString('zh-CN'), 78, 1370);
}

function createPosterCanvas(config = {}) {
  const scale = getCanvasScale();
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH * scale;
  canvas.height = POSTER_HEIGHT * scale;
  canvas.style.width = `${POSTER_WIDTH}px`;
  canvas.style.height = `${POSTER_HEIGHT}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const accent = config.accent || '#8ea2ff';
  const accent2 = config.accent2 || '#2dd4bf';
  const template = pickTemplate(config);
  if (template === 'badge-card') {
    drawBadgeTemplate(ctx, config, accent, accent2);
  } else if (template === 'ledger-clean') {
    drawLedgerTemplate(ctx, config, accent, accent2);
  } else if (template === 'pop-profit') {
    drawPopProfitTemplate(ctx, config, accent, accent2);
  } else {
    drawSignalCardTemplate(ctx, config, accent, accent2);
  }

  return canvas;
}

function dataUrlToBlob(dataUrl) {
  const [meta, payload] = String(dataUrl || '').split(',');
  const mimeType = meta?.match(/data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function createSharePoster(config = {}) {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持生成分享图');
  }
  const canvas = createPosterCanvas(config);
  const blob = dataUrlToBlob(canvas.toDataURL('image/png', 0.96));
  if (!blob) throw new Error('分享图生成失败');
  return {
    blob,
    fileName: config.fileName || `investbrain-share-${Date.now()}.png`,
  };
}

export async function sharePoster(config = {}) {
  const background = config.skipBackgroundPicker
    ? config.background
    : await chooseSharePosterBackground(config);
  const { blob, fileName } = createSharePoster({
    ...config,
    template: background?.template || config.template,
    accent: background?.accent || config.accent,
    accent2: background?.accent2 || config.accent2,
    background: background || config.background,
  });
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        title: config.title || 'InvestBrain 分享图',
        text: config.shareText || config.subtitle || '',
        files: [file],
      });
      return { mode: 'native' };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      downloadBlob(blob, fileName);
      return { mode: 'download' };
    }
  }

  downloadBlob(blob, fileName);
  return { mode: 'download' };
}

export const FREE_IMAGE_MODEL_RECOMMENDATIONS = [
  {
    name: 'Qwen-Image',
    fit: '中文语义、海报构图、NVIDIA Build 可试用/下载',
    caveat: '分享图关键文字仍建议由本地 Canvas 绘制',
  },
  {
    name: 'qwen-image-2512',
    fit: 'NVIDIA Visual GenAI OpenAI-compatible 接口，适合高质量背景',
    caveat: '需要 NVIDIA API Key 或服务端环境变量',
  },
  {
    name: 'FLUX.1-schnell',
    fit: '速度快、Apache 2.0、适合背景和风格图',
    caveat: '中文文字渲染不如模板稳定',
  },
  {
    name: 'flux.2-klein-4b',
    fit: 'NVIDIA Visual GenAI 轻量模型，适合抽象金融氛围图',
    caveat: '更适合作背景，不适合承载收益数字',
  },
  {
    name: 'Stable Diffusion 3.5 Medium',
    fit: '开源生态成熟，适合自部署装饰图',
    caveat: '商用/规模化需核对 Stability 许可条款',
  },
];
