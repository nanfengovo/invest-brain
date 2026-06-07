const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function extractUrls(text = '') {
  return unique(String(text || '').match(URL_PATTERN) || [])
    .map((url) => url.replace(/[，。；;,.]+$/g, ''));
}

function isVideoUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|#|$)/i.test(url)
    || /video\.twimg\.com\/.+\.(mp4|m3u8)(\?|#|$)/i.test(url);
}

function isImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)
    || /pbs\.twimg\.com\/media\//i.test(url)
    || /pbs\.twimg\.com\/amplify_video_thumb\//i.test(url);
}

function isTwitterUrl(url = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com');
  } catch {
    return false;
  }
}

function getTwitterPostId(url = '') {
  if (!isTwitterUrl(url)) return null;
  try {
    const match = new URL(url).pathname.match(/\/status(?:es)?\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function expandShortUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return response.headers.get('location') || null;
  } catch {
    return null;
  }
}

function pickBestVideoVariant(variants = []) {
  const mp4Variants = variants
    .filter((variant) => variant?.url && variant.content_type === 'video/mp4')
    .sort((a, b) => Number(b.bit_rate || 0) - Number(a.bit_rate || 0));
  return mp4Variants[0]?.url || variants.find((variant) => variant?.url)?.url || null;
}

async function resolveTwitterViaApi(tweetId) {
  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken || !tweetId) return null;

  const params = new URLSearchParams({
    expansions: 'attachments.media_keys',
    'tweet.fields': 'attachments',
    'media.fields': 'duration_ms,height,media_key,preview_image_url,type,url,width,variants',
  });
  const apiUrl = `https://api.x.com/2/tweets/${tweetId}?${params.toString()}`;
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return {
      error: `X API returned ${response.status}`,
    };
  }

  const data = await response.json();
  const mediaItems = data.includes?.media || [];
  const videoItem = mediaItems.find((item) => item.type === 'video' || item.type === 'animated_gif');
  const imageItem = mediaItems.find((item) => item.type === 'photo');

  return {
    videoUrl: pickBestVideoVariant(videoItem?.variants || []),
    thumbnailUrl: videoItem?.preview_image_url || imageItem?.url || null,
    mediaType: videoItem?.type || imageItem?.type || null,
  };
}

async function fetchTwitterOembed(url) {
  const response = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { url, content } = req.body || {};
    const urls = unique([url, ...extractUrls(content)]);
    const videoUrl = urls.find(isVideoUrl) || null;
    const thumbnailUrl = urls.find(isImageUrl) || null;

    if (videoUrl || thumbnailUrl) {
      return res.status(200).json({
        success: true,
        source: 'saved-url',
        media: { videoUrl, thumbnailUrl },
      });
    }

    const shortUrl = urls.find((candidate) => {
      try { return new URL(candidate).hostname === 't.co'; } catch { return false; }
    });
    const expandedUrl = shortUrl ? await expandShortUrl(shortUrl) : null;
    const targetUrl = expandedUrl || url;

    if (targetUrl && isTwitterUrl(targetUrl)) {
      const tweetId = getTwitterPostId(targetUrl);
      const apiMedia = await resolveTwitterViaApi(tweetId).catch((error) => ({ error: error.message }));

      if (apiMedia?.videoUrl || apiMedia?.thumbnailUrl) {
        return res.status(200).json({
          success: true,
          source: 'x-api',
          media: {
            videoUrl: apiMedia.videoUrl || null,
            thumbnailUrl: apiMedia.thumbnailUrl || null,
            expandedUrl: targetUrl,
            mediaType: apiMedia.mediaType || null,
          },
        });
      }

      const oembed = await fetchTwitterOembed(targetUrl).catch(() => null);
      const oembedText = oembed?.html || '';
      const oembedUrls = extractUrls(oembedText);
      const oembedVideo = oembedUrls.find(isVideoUrl) || null;
      const oembedImage = oembedUrls.find(isImageUrl) || null;

      return res.status(200).json({
        success: true,
        source: oembedVideo || oembedImage ? 'x-oembed' : 'x-needs-authenticated-media-resolver',
        media: {
          videoUrl: oembedVideo,
          thumbnailUrl: oembedImage,
          expandedUrl: targetUrl,
        },
        message: oembedVideo
          ? 'Resolved X media URL.'
          : 'X/Twitter does not expose the direct video URL through public oEmbed. Configure X_BEARER_TOKEN/TWITTER_BEARER_TOKEN or store video.twimg.com URLs during ingestion.',
        diagnostics: {
          tweetId,
          apiError: apiMedia?.error || null,
          hasBearerToken: Boolean(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN),
        },
      });
    }

    return res.status(200).json({
      success: true,
      source: 'none',
      media: { videoUrl: null, thumbnailUrl: null },
      message: 'No direct media URL found.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve media',
    });
  }
}
