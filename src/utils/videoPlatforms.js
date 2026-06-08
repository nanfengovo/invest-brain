export function getYouTubeId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (!host.endsWith('youtube.com')) return null;

    const watchId = parsed.searchParams.get('v');
    if (watchId) return watchId;

    const [kind, id] = parsed.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(kind) && id) return id;
  } catch {
    return null;
  }
  return null;
}

export function getBilibiliId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/video\/(BV[\w]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function getVimeoId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\./, '').endsWith('vimeo.com')) return null;
    return parsed.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part)) || null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(videoId) {
  if (!videoId) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    vq: 'hd1080',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildBilibiliEmbedUrl(bvid) {
  if (!bvid) return null;
  const params = new URLSearchParams({
    bvid,
    high_quality: '1',
    danmaku: '0',
    autoplay: '0',
  });
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

export function buildVimeoEmbedUrl(videoId) {
  if (!videoId) return null;
  const params = new URLSearchParams({
    dnt: '1',
    quality: '1080p',
  });
  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

export function detectVideoPlatform(url) {
  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      platform: 'youtube',
      provider: 'YouTube',
      videoId: youtubeId,
      embedUrl: buildYouTubeEmbedUrl(youtubeId),
    };
  }

  const bilibiliId = getBilibiliId(url);
  if (bilibiliId) {
    return {
      platform: 'bilibili',
      provider: 'Bilibili',
      videoId: bilibiliId,
      embedUrl: buildBilibiliEmbedUrl(bilibiliId),
    };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      platform: 'vimeo',
      provider: 'Vimeo',
      videoId: vimeoId,
      embedUrl: buildVimeoEmbedUrl(vimeoId),
    };
  }

  return null;
}
