import { chooseSharePosterBackground } from './sharePosterBackgrounds.jsx';

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;
const POSTER_PADDING = 72;
const SHARE_BRAND = 'InvestBrain';

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
  ctx.font = '800 46px "DIN Alternate", "PingFang SC", sans-serif';
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
  const typeLabel = config.typeLabel || '分享图';
  const metrics = Array.isArray(config.metrics) ? config.metrics.slice(0, 4) : [];
  const highlights = normalizeLines(config.highlights, 5);

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

  if (highlights.length > 0) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 34px "PingFang SC", sans-serif';
    ctx.fillText(config.sectionTitle || '关键要点', POSTER_PADDING + 44, y + 34);
    y += 76;

    highlights.forEach((item) => {
      ctx.fillStyle = accent2;
      ctx.beginPath();
      ctx.arc(POSTER_PADDING + 56, y - 9, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
      ctx.font = '600 30px "PingFang SC", "Noto Sans CJK SC", sans-serif';
      const lines = clampText(ctx, item, POSTER_WIDTH - POSTER_PADDING * 2 - 122, 2);
      lines.forEach((line, index) => {
        ctx.fillText(line, POSTER_PADDING + 80, y + index * 42);
      });
      y += Math.max(62, lines.length * 42 + 18);
    });
  }

  ctx.fillStyle = 'rgba(148, 163, 184, 0.62)';
  ctx.font = '500 24px "PingFang SC", sans-serif';
  ctx.fillText(config.footer || '本地优先 · 交易记录与分析 Agent', POSTER_PADDING + 44, POSTER_HEIGHT - 138);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.font = '500 22px "PingFang SC", sans-serif';
  ctx.fillText(new Date().toLocaleString('zh-CN'), POSTER_PADDING + 44, POSTER_HEIGHT - 102);

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
