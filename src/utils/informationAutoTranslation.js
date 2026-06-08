import { buildAiRequestBody, buildAiRequestHeaders, getAiUsageLabel } from './aiProviders';

const BUILTIN_AI_API_BASE_URL = 'https://invest-brain.vercel.app';
const CACHE_KEY = 'ib_information_translation_cache_v1';
const MAX_CACHE_ITEMS = 160;

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hashText(value = '') {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readCache() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, MAX_CACHE_ITEMS);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Translation cache is optional; never block the UI for storage limits.
  }
}

function getCacheId(info) {
  return String(info?.origin_id || info?.id || '').trim();
}

function getSummarizeApiUrl(hasLocalApiKey) {
  if (hasLocalApiKey) return '/api/summarize';
  if (typeof window === 'undefined') return '/api/summarize';

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (localHosts.has(window.location.hostname)) {
    return `${BUILTIN_AI_API_BASE_URL}/api/summarize`;
  }

  return '/api/summarize';
}

export function shouldAutoTranslateText(value = '') {
  const text = normalizeText(value)
    .replace(/https?:\/\/\S+/g, '')
    .slice(0, 1200);
  if (!text || text.length < 2) return false;

  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const hangulCount = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const kanaCount = (text.match(/[\u3040-\u30ff]/g) || []).length;
  const latinWords = (text.match(/[A-Za-z]{3,}/g) || []).length;
  const nonChineseSignal = hangulCount + kanaCount + latinWords * 3;

  if (hangulCount + kanaCount >= 2) return true;
  if (chineseCount >= 10 && chineseCount >= nonChineseSignal) return false;
  return latinWords >= 5 && chineseCount < 8;
}

export function getCachedInformationTranslation(info, { title = '', content = '' } = {}) {
  const id = getCacheId(info);
  if (!id) return null;

  const cache = readCache();
  const cached = cache[id];
  if (!cached) return null;

  const titleHash = hashText(title || info?.title || '');
  const contentHash = hashText(content || info?.content || '');
  return {
    title: cached.titleHash === titleHash ? cached.title || '' : '',
    content: cached.contentHash === contentHash ? cached.content || '' : '',
    modelLabel: cached.modelLabel || '',
  };
}

export function saveInformationTranslation(info, { title = '', content = '', translatedTitle = '', translatedContent = '', modelLabel = '' } = {}) {
  const id = getCacheId(info);
  if (!id) return;

  const cache = readCache();
  const previous = cache[id] || {};
  cache[id] = {
    ...previous,
    title: translatedTitle || previous.title || '',
    content: translatedContent || previous.content || '',
    titleHash: translatedTitle ? hashText(title || info?.title || '') : previous.titleHash,
    contentHash: translatedContent ? hashText(content || info?.content || '') : previous.contentHash,
    modelLabel: modelLabel || previous.modelLabel || '',
    updatedAt: Date.now(),
  };
  writeCache(cache);
}

export async function translateTextToChinese({
  text,
  title = '',
  geminiApiKey = '',
  nvidiaApiKey = '',
  aiProviderConfig,
  signal,
  timeoutMs = 45000,
}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) return { translatedText: '', modelLabel: '' };

  const requestController = new AbortController();
  let timeoutId = null;
  const abortRequest = () => {
    if (!requestController.signal.aborted) requestController.abort();
  };

  if (signal) {
    if (signal.aborted) abortRequest();
    else signal.addEventListener('abort', abortRequest, { once: true });
  }
  if (timeoutMs > 0) {
    timeoutId = setTimeout(abortRequest, timeoutMs);
  }

  const localGeminiKey = String(geminiApiKey || '').trim();
  const localNvidiaKey = String(nvidiaApiKey || '').trim();
  const headers = buildAiRequestHeaders({ geminiApiKey: localGeminiKey, nvidiaApiKey: localNvidiaKey });
  let result;
  try {
    const response = await fetch(getSummarizeApiUrl(Boolean(localGeminiKey || localNvidiaKey)), {
      method: 'POST',
      headers,
      signal: requestController.signal,
      body: JSON.stringify(buildAiRequestBody(aiProviderConfig, {
        mode: 'translate',
        title,
        text: sourceText,
        sourceLanguage: 'auto',
      })),
    });

    result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener?.('abort', abortRequest);
  }

  return {
    translatedText: String(result.translatedText || '').trim(),
    modelLabel: getAiUsageLabel(result) || result.model || '',
    raw: result,
  };
}
