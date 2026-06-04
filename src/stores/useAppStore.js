import { create } from 'zustand';
import { db } from '../db/database';

export const useAppStore = create((set) => ({
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

  // Active tab
  activeTab: '/',

  setActiveTab: (tab) => set({ activeTab: tab }),

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
