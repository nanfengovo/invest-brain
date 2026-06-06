import { create } from 'zustand';
import { db } from '../db/database';

const MARKET_WATCHLIST_KEY = 'ib_market_watchlist';
const SYNC_USER_ID_KEY = 'invest_sync_user_id';
const SYNC_SECRET_KEY = 'invest_sync_secret';

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

  // Cloud Sync state
  syncUserId: '',
  syncSecret: '',
  setSyncUserId: (id) => set({ syncUserId: id }),
  setSyncSecret: (secret) => set({ syncSecret: secret }),
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
