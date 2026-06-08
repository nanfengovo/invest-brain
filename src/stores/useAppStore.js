import { create } from 'zustand';
import { db } from '../db/database';
import { DEFAULT_AI_PROVIDER_CONFIG } from '../utils/aiProviders';

const MARKET_WATCHLIST_KEY = 'ib_market_watchlist';
const SYNC_USER_ID_KEY = 'invest_sync_user_id';
const SYNC_SECRET_KEY = 'invest_sync_secret';
const WORKSPACE_SCOPE_KEY = 'ib_workspace_scope';
const DEFAULT_NOTIFICATION_CONFIG = {
  emailEnabled: false,
  emailApiKey: '',
  emailFrom: '',
  emailTo: '',
  feishuEnabled: false,
  feishuWebhook: '',
  browserEnabled: true,
  alertCheckIntervalMinutes: 1,
};
const DEFAULT_MARKET_DATA_CONFIG = {
  optionProvider: 'auto',
  tradierToken: '',
  polygonToken: '',
};
const DEFAULT_SHARE_BACKGROUND_CONFIG = {
  provider: 'local',
  nvidiaApiKey: '',
  defaultModel: 'qwen-image-2512',
};

const normalizeMarketWatchItem = (item) => {
  const symbol = String(item?.symbol || '').trim().toUpperCase();
  if (!symbol) return null;

  return {
    symbol,
    name: item.shortname || item.longname || item.name || symbol,
    exchange: item.exchDisp || item.exchange || '',
    quoteType: item.quoteType || '',
    typeDisp: item.typeDisp || item.quoteType || '',
    addedAt: item.addedAt || Date.now(),
  };
};

const loadMarketWatchlist = () => {
  try {
    const raw = localStorage.getItem(MARKET_WATCHLIST_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeMarketWatchItem)
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to load market watchlist', error);
    return [];
  }
};

const saveMarketWatchlist = (items) => {
  localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify(items));
};

export const useAppStore = create((set, get) => ({
  // Database state
  isDbReady: false,
  isDbPersistent: false,
  dbError: null,

  setDbReady: (ready, persistent = false) =>
    set({ isDbReady: ready, isDbPersistent: persistent }),
  setDbError: (error) => set({ dbError: error }),

  // Gemini API Key state
  geminiApiKey: '',
  setGeminiApiKey: (key) => set({ geminiApiKey: key }),
  loadGeminiApiKey: async () => {
    try {
      const key = await db.getSetting('gemini_api_key');
      set({ geminiApiKey: key || '' });
    } catch (e) {
      console.error('Failed to load geminiApiKey from DB', e);
    }
  },
  saveGeminiApiKey: async (key) => {
    try {
      await db.setSetting('gemini_api_key', key);
      set({ geminiApiKey: key });
    } catch (e) {
      console.error('Failed to save geminiApiKey to DB', e);
      throw e;
    }
  },

  // Unified AI provider state
  nvidiaApiKey: '',
  aiProviderConfig: DEFAULT_AI_PROVIDER_CONFIG,
  setNvidiaApiKey: (key) => set({ nvidiaApiKey: key }),
  setAiProviderConfig: (config) => set({
    aiProviderConfig: { ...DEFAULT_AI_PROVIDER_CONFIG, ...(config || {}) },
  }),
  loadNvidiaApiKey: async () => {
    try {
      const key = await db.getSetting('nvidia_api_key');
      set({ nvidiaApiKey: key || '' });
    } catch (e) {
      console.error('Failed to load nvidiaApiKey from DB', e);
    }
  },
  saveNvidiaApiKey: async (key) => {
    try {
      const normalized = String(key || '').trim();
      await db.setSetting('nvidia_api_key', normalized);
      set({ nvidiaApiKey: normalized });
    } catch (e) {
      console.error('Failed to save nvidiaApiKey to DB', e);
      throw e;
    }
  },
  loadAiProviderConfig: async () => {
    try {
      const raw = await db.getSetting('ai_provider_config');
      set({
        aiProviderConfig: raw
          ? { ...DEFAULT_AI_PROVIDER_CONFIG, ...JSON.parse(raw) }
          : DEFAULT_AI_PROVIDER_CONFIG,
      });
    } catch (e) {
      console.error('Failed to load aiProviderConfig from DB', e);
      set({ aiProviderConfig: DEFAULT_AI_PROVIDER_CONFIG });
    }
  },
  saveAiProviderConfig: async (config) => {
    const normalized = { ...DEFAULT_AI_PROVIDER_CONFIG, ...(config || {}) };
    await db.setSetting('ai_provider_config', JSON.stringify(normalized));
    set({ aiProviderConfig: normalized });
  },

  // Cloud Sync state
  syncUserId: '',
  syncSecret: '',
  workspaceScope: localStorage.getItem(WORKSPACE_SCOPE_KEY) === 'team' ? 'team' : 'personal',
  setSyncUserId: (id) => set({ syncUserId: id }),
  setSyncSecret: (secret) => set({ syncSecret: secret }),
  setWorkspaceScope: (scope) => {
    const nextScope = scope === 'team' ? 'team' : 'personal';
    localStorage.setItem(WORKSPACE_SCOPE_KEY, nextScope);
    set({ workspaceScope: nextScope });
  },
  loadSyncConfig: async () => {
    try {
      const userId = await db.getSetting('sync_user_id') || localStorage.getItem(SYNC_USER_ID_KEY);
      const secret = await db.getSetting('sync_secret') || localStorage.getItem(SYNC_SECRET_KEY);
      set({ syncUserId: userId || '', syncSecret: secret || '' });
    } catch (e) {
      console.error('Failed to load sync config from DB', e);
    }
  },
  saveSyncConfig: async (userId, secret) => {
    try {
      const normalizedUserId = String(userId || '').trim();
      const normalizedSecret = String(secret || '').trim();

      await db.setSetting('sync_user_id', normalizedUserId);
      await db.setSetting('sync_secret', normalizedSecret);

      if (normalizedUserId) {
        localStorage.setItem(SYNC_USER_ID_KEY, normalizedUserId);
      } else {
        localStorage.removeItem(SYNC_USER_ID_KEY);
      }

      if (normalizedSecret) {
        localStorage.setItem(SYNC_SECRET_KEY, normalizedSecret);
      } else {
        localStorage.removeItem(SYNC_SECRET_KEY);
      }

      set({ syncUserId: normalizedUserId, syncSecret: normalizedSecret });
    } catch (e) {
      console.error('Failed to save sync config to DB', e);
      throw e;
    }
  },

  // Notification & market data provider settings
  notificationConfig: DEFAULT_NOTIFICATION_CONFIG,
  marketDataConfig: DEFAULT_MARKET_DATA_CONFIG,
  shareBackgroundConfig: DEFAULT_SHARE_BACKGROUND_CONFIG,
  loadNotificationConfig: async () => {
    try {
      const raw = await db.getSetting('notification_config');
      set({
        notificationConfig: raw
          ? { ...DEFAULT_NOTIFICATION_CONFIG, ...JSON.parse(raw) }
          : DEFAULT_NOTIFICATION_CONFIG,
      });
    } catch (e) {
      console.error('Failed to load notification config', e);
      set({ notificationConfig: DEFAULT_NOTIFICATION_CONFIG });
    }
  },
  saveNotificationConfig: async (config) => {
    const normalized = { ...DEFAULT_NOTIFICATION_CONFIG, ...(config || {}) };
    await db.setSetting('notification_config', JSON.stringify(normalized));
    set({ notificationConfig: normalized });
  },
  loadMarketDataConfig: async () => {
    try {
      const raw = await db.getSetting('market_data_config');
      set({
        marketDataConfig: raw
          ? { ...DEFAULT_MARKET_DATA_CONFIG, ...JSON.parse(raw) }
          : DEFAULT_MARKET_DATA_CONFIG,
      });
    } catch (e) {
      console.error('Failed to load market data config', e);
      set({ marketDataConfig: DEFAULT_MARKET_DATA_CONFIG });
    }
  },
  saveMarketDataConfig: async (config) => {
    const normalized = { ...DEFAULT_MARKET_DATA_CONFIG, ...(config || {}) };
    await db.setSetting('market_data_config', JSON.stringify(normalized));
    set({ marketDataConfig: normalized });
  },
  loadShareBackgroundConfig: async () => {
    try {
      const raw = await db.getSetting('share_background_config');
      set({
        shareBackgroundConfig: raw
          ? { ...DEFAULT_SHARE_BACKGROUND_CONFIG, ...JSON.parse(raw) }
          : DEFAULT_SHARE_BACKGROUND_CONFIG,
      });
    } catch (e) {
      console.error('Failed to load share background config', e);
      set({ shareBackgroundConfig: DEFAULT_SHARE_BACKGROUND_CONFIG });
    }
  },
  saveShareBackgroundConfig: async (config) => {
    const normalized = { ...DEFAULT_SHARE_BACKGROUND_CONFIG, ...(config || {}) };
    await db.setSetting('share_background_config', JSON.stringify(normalized));
    set({ shareBackgroundConfig: normalized });
  },

  // Active tab
  activeTab: '/',

  setActiveTab: (tab) => set({ activeTab: tab }),

  // Market watchlist
  marketWatchlist: loadMarketWatchlist(),

  addMarketWatchItem: (item) => {
    const normalized = normalizeMarketWatchItem(item);
    if (!normalized) return false;

    const current = get().marketWatchlist;
    if (current.some((watchItem) => watchItem.symbol === normalized.symbol)) {
      return false;
    }

    const next = [normalized, ...current].slice(0, 80);
    saveMarketWatchlist(next);
    set({ marketWatchlist: next });
    return true;
  },

  removeMarketWatchItem: (symbol) => {
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    if (!normalizedSymbol) return;

    const next = get().marketWatchlist.filter((item) => item.symbol !== normalizedSymbol);
    saveMarketWatchlist(next);
    set({ marketWatchlist: next });
  },

  // Streamlit AI URL
  streamlitUrl: localStorage.getItem('ib_streamlit_url') || 'https://invest-brain-dataanaly.streamlit.app/',
  setStreamlitUrl: (url) => {
    localStorage.setItem('ib_streamlit_url', url);
    set({ streamlitUrl: url });
  },

  // Loading overlay
  globalLoading: false,
  globalLoadingText: '',

  setGlobalLoading: (loading, text = '') =>
    set({ globalLoading: loading, globalLoadingText: text }),

  // Theming & Preferences
  theme: localStorage.getItem('ib_theme') || 'dark', // 'light' | 'dark'
  colorConvention: localStorage.getItem('ib_color_convention') || 'green-up', // 'green-up' | 'red-up'
  
  setTheme: (theme) => {
    localStorage.setItem('ib_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  
  setColorConvention: (conv) => {
    localStorage.setItem('ib_color_convention', conv);
    document.documentElement.setAttribute('data-color-mode', conv);
    set({ colorConvention: conv });
  }
}));
