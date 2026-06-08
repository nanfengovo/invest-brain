import { create } from 'zustand';
import { db } from '../db/database';
import { triggerAutoBackup } from '../utils/autoBackup';
import {
  buildDecisionAssetPayload,
  getDecisionPersistenceErrorMessage,
  normalizeDecisionAssetId,
} from '../utils/decisionPersistence';
import { useAppStore } from './useAppStore';

const getWorkspaceScope = () => useAppStore.getState().workspaceScope || 'personal';
const getCurrentAuthor = () => {
  const { syncUserId } = useAppStore.getState();
  return String(syncUserId || localStorage.getItem('invest_sync_user_id') || '未标记').trim() || '未标记';
};
const assertPersonalWorkspace = () => {
  if (getWorkspaceScope() === 'team') {
    return { success: false, error: '团队工作区是只读镜像，请先切换到个人工作区再编辑' };
  }
  return null;
};
const ensureDecisionAsset = async (assetId, sector) => {
  const assetPayload = buildDecisionAssetPayload(assetId, sector);
  if (!assetPayload) return null;

  const existing = await db.getAssetById(assetPayload.id);
  if (!existing) {
    await db.upsertAsset(assetPayload);
  }
  return assetPayload.id;
};

export const useTradeStore = create((set, get) => ({
  // Trade data
  trades: [],
  holdings: [],
  summary: {},
  decisions: [],
  assets: [],
  stats: {},

  // Loading states
  tradesLoading: false,
  holdingsLoading: false,
  decisionsLoading: false,
  assetsLoading: false,

  // ==========================================
  // Trade actions
  // ==========================================

  refreshTrades: async () => {
    set({ tradesLoading: true });
    try {
      await db.markExpiredOptionTrades(getWorkspaceScope());
      const trades = await db.getTrades(2000, 0, getWorkspaceScope());
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
        underlying_symbol: trade.underlying_symbol || trade.symbol || null,
        option_type: trade.option_type || null,
        multiplier: trade.multiplier || (trade.asset_type === 'OPTION' ? 100 : 1),
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
      await db.updateTrade({ ...trade, sync_status: 'local' });
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

  refreshHoldings: async (author = null, scope = getWorkspaceScope()) => {
    set({ holdingsLoading: true });
    try {
      await db.markExpiredOptionTrades(scope);
      const [holdings, summary, stats] = await Promise.all([
        db.getHoldings(author, scope),
        db.getPortfolioSummary(author, scope),
        db.getStats(),
      ]);
      set({ holdings, summary, stats, holdingsLoading: false });
    } catch (err) {
      console.error('Failed to load holdings:', err);
      set({ holdingsLoading: false });
    }
  },

  refreshAssets: async () => {
    set({ assetsLoading: true });
    try {
      const assets = await db.getAssets();
      set({ assets, assetsLoading: false });
      return { success: true, data: assets };
    } catch (err) {
      console.error('Failed to load assets:', err);
      set({ assetsLoading: false });
      return { success: false, error: err.message };
    }
  },

  getHoldings: async (author = null, scope = getWorkspaceScope()) => {
    try {
      const holdings = await db.getHoldings(author, scope);
      set({ holdings });
      return { success: true, data: holdings };
    } catch (err) {
      console.error('Failed to read holdings:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // Decision actions
  // ==========================================

  refreshDecisions: async () => {
    set({ decisionsLoading: true });
    try {
      const decisions = await db.getDecisions(null, getWorkspaceScope());
      set({ decisions, decisionsLoading: false });
    } catch (err) {
      console.error('Failed to load decisions:', err);
      set({ decisionsLoading: false });
    }
  },

  addDecision: async (decision) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
      const currentAuthor = getCurrentAuthor();
      const assetId = await ensureDecisionAsset(decision.asset_id, decision.sector);
      await db.addDecision({
        ...decision,
        asset_id: assetId,
        author: decision.author || currentAuthor,
        source_author: decision.source_author || decision.author || currentAuthor,
        workspace_scope: 'personal',
        source_scope: decision.source_scope || 'personal',
        origin_id: decision.origin_id || decision.id,
        sync_status: decision.sync_status || 'local',
      });
      await get().refreshDecisions();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add decision:', err);
      return { success: false, error: getDecisionPersistenceErrorMessage(err, '保存') };
    }
  },

  updateDecision: async (id, updates) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
      const hasAssetUpdate = Object.prototype.hasOwnProperty.call(updates, 'asset_id');
      const normalizedAssetId = hasAssetUpdate ? normalizeDecisionAssetId(updates.asset_id) : undefined;
      if (normalizedAssetId) {
        await ensureDecisionAsset(normalizedAssetId, updates.sector);
      }
      await db.updateDecision(id, {
        ...updates,
        ...(hasAssetUpdate ? { asset_id: normalizedAssetId } : {}),
        sync_status: 'local',
      });
      await get().refreshDecisions();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update decision:', err);
      return { success: false, error: getDecisionPersistenceErrorMessage(err, '更新') };
    }
  },

  deleteDecision: async (id) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      const informations = await db.getInformations(status, getWorkspaceScope());
      set({ informations, informationsLoading: false });
    } catch (err) {
      console.error('Failed to load informations:', err);
      set({ informationsLoading: false });
    }
  },

  addInformation: async (info) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
      const currentAuthor = getCurrentAuthor();
      await db.addInformation({
        ...info,
        author: info.author || currentAuthor,
        source_author: info.source_author || info.author || currentAuthor,
        workspace_scope: 'personal',
        source_scope: info.source_scope || 'personal',
        origin_id: info.origin_id || info.id,
        sync_status: info.sync_status || 'local',
      });
      await get().refreshInformations();
      await get().refreshAssets();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to add information:', err);
      return { success: false, error: err.message };
    }
  },

  updateInformation: async (info) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
      await db.updateInformation({ ...info, sync_status: 'local' });
      await get().refreshInformations();
      await get().refreshAssets();
      triggerAutoBackup().catch((e) => console.error('[AutoBackup] Error:', e));
      return { success: true };
    } catch (err) {
      console.error('Failed to update information:', err);
      return { success: false, error: err.message };
    }
  },

  deleteInformation: async (id) => {
    try {
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
      const currentAuthor = getCurrentAuthor();
      await db.addViewpoint({
        ...vp,
        author: vp.author || currentAuthor,
        source_author: vp.source_author || vp.author || currentAuthor,
        workspace_scope: 'personal',
        source_scope: vp.source_scope || 'personal',
        origin_id: vp.origin_id || vp.id,
        sync_status: vp.sync_status || 'local',
      });
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
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      const blocked = assertPersonalWorkspace();
      if (blocked) return blocked;
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
      await db.markExpiredOptionTrades(getWorkspaceScope());
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
    await db.markExpiredOptionTrades(getWorkspaceScope());
    await Promise.all([
      get().refreshTrades(),
      get().refreshHoldings(),
      get().refreshDecisions(),
      get().refreshInformations(),
    ]);
  },
}));
