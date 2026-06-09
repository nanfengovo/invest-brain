const API_CACHE_PREFIX = 'ib_api_cache_v1:';
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_STALE_TTL_MS = 5 * 60_000;
const MAX_MEMORY_ENTRIES = 120;

const memoryCache = new Map();
const pendingRequests = new Map();

const now = () => Date.now();

const normalizeKey = (key) => `${API_CACHE_PREFIX}${String(key || '').trim()}`;

const pruneMemoryCache = () => {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const entries = Array.from(memoryCache.entries())
    .sort((a, b) => (a[1]?.fetchedAt || 0) - (b[1]?.fetchedAt || 0));
  entries.slice(0, Math.ceil(MAX_MEMORY_ENTRIES / 4)).forEach(([key]) => {
    memoryCache.delete(key);
  });
};

const readStorageCache = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(normalizeKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStorageCache = (key, entry) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(normalizeKey(key), JSON.stringify(entry));
  } catch {
    // Cache is only a perceived-speed optimization; storage limits should never block data loading.
  }
};

export function buildApiCacheKey(parts) {
  return parts
    .flat()
    .map((part) => String(part ?? '').trim())
    .join('|');
}

export function readApiCache(cacheKey, { maxAgeMs = DEFAULT_STALE_TTL_MS } = {}) {
  if (!cacheKey) return null;
  const key = normalizeKey(cacheKey);
  const entry = memoryCache.get(key) || readStorageCache(cacheKey);
  if (!entry?.data || !entry.fetchedAt) return null;
  if (now() - Number(entry.fetchedAt) > maxAgeMs) return null;
  return {
    data: entry.data,
    ageMs: now() - Number(entry.fetchedAt),
    fetchedAt: entry.fetchedAt,
  };
}

export function writeApiCache(cacheKey, data) {
  if (!cacheKey || data === undefined) return;
  const key = normalizeKey(cacheKey);
  const entry = {
    fetchedAt: now(),
    data,
  };
  memoryCache.set(key, entry);
  pruneMemoryCache();
  writeStorageCache(cacheKey, entry);
}

export async function fetchJsonWithCache(url, requestOptions = {}, cacheOptions = {}) {
  const {
    cacheKey = url,
    ttlMs = DEFAULT_TTL_MS,
    staleTtlMs = DEFAULT_STALE_TTL_MS,
    timeoutMs = 12_000,
    force = false,
    dedupe = true,
    useStaleOnError = true,
  } = cacheOptions;

  const fresh = force ? null : readApiCache(cacheKey, { maxAgeMs: ttlMs });
  if (fresh) {
    return { data: fresh.data, cacheStatus: 'hit', ageMs: fresh.ageMs };
  }

  const stale = force ? null : readApiCache(cacheKey, { maxAgeMs: staleTtlMs });
  const pendingKey = normalizeKey(cacheKey);
  if (dedupe && pendingRequests.has(pendingKey)) {
    return pendingRequests.get(pendingKey);
  }

  const requestPromise = (async () => {
    const externalSignal = requestOptions.signal;
    const controller = timeoutMs ? new AbortController() : null;
    let timeoutId = null;
    let abortHandler = null;

    if (controller) {
      if (externalSignal?.aborted) {
        controller.abort(externalSignal.reason);
      } else if (externalSignal) {
        abortHandler = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', abortHandler, { once: true });
      }
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller?.signal || externalSignal,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(json.error || json.message || `请求失败（HTTP ${response.status}）`);
        error.status = response.status;
        error.payload = json;
        throw error;
      }
      writeApiCache(cacheKey, json);
      return { data: json, cacheStatus: 'miss', ageMs: 0 };
    } catch (error) {
      if (useStaleOnError && stale?.data && error?.name !== 'AbortError') {
        return { data: stale.data, cacheStatus: 'stale-error', ageMs: stale.ageMs, error };
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (externalSignal && abortHandler) {
        externalSignal.removeEventListener('abort', abortHandler);
      }
    }
  })();

  if (dedupe) {
    pendingRequests.set(pendingKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (dedupe) {
      pendingRequests.delete(pendingKey);
    }
  }
}
