import { create } from 'zustand';
import { db } from '../db/database';
import { triggerAutoBackup } from '../utils/autoBackup';

export const useTradeStore = create((set, get) => ({
  // Trade data
  trades: [],
  holdings: [],
  summary: {},
  decisions: [],
  stats: {},

  // Loading states
  tradesLoading: false,
  holdingsLoading: false,
  decisionsLoading: false,

  // ==========================================
  // Trade actions
  // ==========================================

  refreshTrades: async () => {
    set({ tradesLoading: true });
    try {
      const trades = await db.getTrades(200);
      set({ trades, tradesLoading: false });
    } catch (err) {
      console.error('Failed to load trades:', err);
      set({ tradesLoading: false });
    }
  },

  addTrade: async (trade) => {
    try {
      // Ensure asset exists
      await db.upsertAsset({
        id: trade.asset_id,
        symbol: trade.symbol,
        name: trade.asset_name || '',
        type: trade.asset_type || 'STOCK',
        sector: trade.sector || null,
        strike_price: trade.strike_price || null,
        expiry_date: trade.expiry_date || null,
      });

      await db.addTrade(trade);
      await get().refreshTrades();
      await get().refreshHoldings();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add trade:', err);
      return { success: false, error: err.message };
    }
  },

  updateTrade: async (trade) => {
    try {
      await db.updateTrade(trade);
      await get().refreshTrades();
      await get().refreshHoldings();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update trade:', err);
      return { success: false, error: err.message };
    }
  },

  deleteTrade: async (id) => {
    try {
      await db.deleteTrade(id);
      await get().refreshTrades();
      await get().refreshHoldings();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete trade:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Holdings actions
  // ==========================================

  refreshHoldings: async () => {
    set({ holdingsLoading: true });
    try {
      const [holdings, summary, stats] = await Promise.all([
        db.getHoldings(),
        db.getPortfolioSummary(),
        db.getStats(),
      ]);
      set({ holdings, summary, stats, holdingsLoading: false });
    } catch (err) {
      console.error('Failed to load holdings:', err);
      set({ holdingsLoading: false });
    }
  },

  // ==========================================
  // Decision actions
  // ==========================================

  refreshDecisions: async () => {
    set({ decisionsLoading: true });
    try {
      const decisions = await db.getDecisions();
      set({ decisions, decisionsLoading: false });
    } catch (err) {
      console.error('Failed to load decisions:', err);
      set({ decisionsLoading: false });
    }
  },

  addDecision: async (decision) => {
    try {
      await db.addDecision(decision);
      await get().refreshDecisions();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add decision:', err);
      return { success: false, error: err.message };
    }
  },

  updateDecision: async (id, updates) => {
    try {
      await db.updateDecision(id, updates);
      await get().refreshDecisions();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update decision:', err);
      return { success: false, error: err.message };
    }
  },

  deleteDecision: async (id) => {
    try {
      await db.deleteDecision(id);
      await get().refreshDecisions();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete decision:', err);
      return { success: false, error: err.message };
    }
  },

  addReview: async (review) => {
    try {
      await db.addReview(review);
      await db.updateDecision(review.decision_id, { status: 'CLOSED' });
      await get().refreshDecisions();
      await get().refreshHoldings();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add review:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Information actions
  // ==========================================

  informations: [],
  informationsLoading: false,

  refreshInformations: async (status = null) => {
    set({ informationsLoading: true });
    try {
      const informations = await db.getInformations(status);
      set({ informations, informationsLoading: false });
    } catch (err) {
      console.error('Failed to load informations:', err);
      set({ informationsLoading: false });
    }
  },

  addInformation: async (info) => {
    try {
      await db.addInformation(info);
      await get().refreshInformations();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add information:', err);
      return { success: false, error: err.message };
    }
  },

  updateInformation: async (info) => {
    try {
      await db.updateInformation(info);
      await get().refreshInformations();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update information:', err);
      return { success: false, error: err.message };
    }
  },

  deleteInformation: async (id) => {
    try {
      await db.deleteInformation(id);
      await get().refreshInformations();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete information:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Viewpoints actions
  // ==========================================

  addViewpoint: async (vp) => {
    try {
      await db.addViewpoint(vp);
      await get().refreshInformations(); // updates viewpoint_count
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add viewpoint:', err);
      return { success: false, error: err.message };
    }
  },

  updateViewpoint: async (vp) => {
    try {
      await db.updateViewpoint(vp);
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update viewpoint:', err);
      return { success: false, error: err.message };
    }
  },

  deleteViewpoint: async (id) => {
    try {
      await db.deleteViewpoint(id);
      await get().refreshInformations();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete viewpoint:', err);
      return { success: false, error: err.message };
    }
  },

  updateViewpointStatus: async (id, status) => {
    try {
      await db.updateViewpointStatus(id, status);
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update viewpoint status:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Insights & Analytics
  // ==========================================
  getTradingInsights: async (days = 30) => {
    try {
      const now = Date.now();
      const startTimestamp = days === 'all' ? 0 : now - days * 24 * 60 * 60 * 1000;
      const data = await db.getClosedLoopData(startTimestamp, now);
      return { success: true, data };
    } catch (err) {
      console.error('Failed to get trading insights:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Refresh all data
  // ==========================================

  refreshAll: async () => {
    await Promise.all([
      get().refreshTrades(),
      get().refreshHoldings(),
      get().refreshDecisions(),
      get().refreshInformations(),
    ]);
  },
}));
