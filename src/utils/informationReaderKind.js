export function resolveInformationReaderKind({
  infoType,
  cleanContent,
  fileUrl,
  isPdf,
  isRemotePdf,
  isEpub,
  isRemoteEpub,
  isHtmlContent,
  isImageInfo,
  isVideoInfo,
  resolvedImageUrl,
  resolvedVideoUrl,
  videoEmbedUrl,
  twitterPostId,
  validUrl,
  videoPlatform,
}) {
  const hasContent = Boolean(String(cleanContent || '').trim());
  const isArticleInfo = infoType === 'ARTICLE';

  if (isPdf || isRemotePdf) return 'pdf';
  if (isEpub || isRemoteEpub) return 'epub';
  if (isArticleInfo && hasContent) return isHtmlContent ? 'html' : 'markdown';
  if ((isVideoInfo || !hasContent) && (videoEmbedUrl || videoPlatform || resolvedVideoUrl)) return 'video';
  if ((isImageInfo || !hasContent) && (resolvedImageUrl || (fileUrl && isImageInfo))) return 'image';
  if (twitterPostId) return 'xpost';
  if (isHtmlContent) return 'html';
  if (hasContent) return 'markdown';
  if (validUrl) return 'webpage';
  return 'empty';
}
