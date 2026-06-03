import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Database state
  isDbReady: false,
  isDbPersistent: false,
  dbError: null,

  setDbReady: (ready, persistent = false) =>
    set({ isDbReady: ready, isDbPersistent: persistent }),
  setDbError: (error) => set({ dbError: error }),

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
