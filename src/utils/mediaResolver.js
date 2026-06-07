const MEDIA_URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

export function extractUrlsFromText(text = '') {
  return [...new Set(String(text || '').match(MEDIA_URL_PATTERN) || [])]
    .map((url) => url.replace(/[，。；;,.]+$/g, ''));
}

export function isVideoMediaUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|#|$)/i.test(url)
    || /video\.twimg\.com\/.+\.(mp4|m3u8)(\?|#|$)/i.test(url);
}

export function isImageMediaUrl(url = '') {
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)
    || /pbs\.twimg\.com\/media\//i.test(url)
    || /pbs\.twimg\.com\/amplify_video_thumb\//i.test(url);
}

export function findMediaUrls(...values) {
  const urls = values.flatMap((value) => extractUrlsFromText(value));
  const videos = urls.filter(isVideoMediaUrl);
  const images = urls.filter(isImageMediaUrl);
  return {
    videos: [...new Set(videos)],
    images: [...new Set(images)],
  };
}
