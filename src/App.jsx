import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Modal } from 'antd-mobile';
import { useAppStore } from './stores/useAppStore';
import { useTradeStore } from './stores/useTradeStore';
import { initDB, db } from './db/database';
import { hasBackup, restoreAutoBackup } from './utils/autoBackup';
import { checkPriceAlerts } from './utils/priceAlertRunner';
import AppShell from './components/Layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import LoadingSpinner from './components/common/LoadingSpinner';

const TradesPage = lazy(() => import('./pages/TradesPage'));
const DecisionsPage = lazy(() => import('./pages/DecisionsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const InformationPage = lazy(() => import('./pages/InformationPage'));
const InformationDetail = lazy(() => import('./pages/InformationDetail'));
const HoldingsPage = lazy(() => import('./pages/HoldingsPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'));

function App({ onReady }) {
  const [initError, setInitError] = useState(null);
  const { isDbReady, setDbReady, setDbError, notificationConfig, marketDataConfig } = useAppStore();
  const refreshAll = useTradeStore((s) => s.refreshAll);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const result = await initDB();
        if (!mounted) return;
        setDbReady(true, result.persistent);

        // Load settings
        await useAppStore.getState().loadGeminiApiKey();
        await useAppStore.getState().loadSyncConfig();
        await useAppStore.getState().loadNotificationConfig();
        await useAppStore.getState().loadMarketDataConfig();

        // PWA Recovery: Check if data was lost (e.g., PWA removed from homescreen)
        try {
          const hasData = await db.hasAnyData();
          if (!hasData) {
            const backup = await hasBackup();
            if (backup.exists) {
              const backupTime = backup.timestamp 
                ? new Date(backup.timestamp).toLocaleString('zh-CN') 
                : '未知时间';
              
              const confirmed = await Modal.confirm({
                title: '检测到数据可能丢失',
                content: `数据库为空，但发现 ${backupTime} 的自动备份。是否恢复数据？`,
                confirmText: '恢复数据',
                cancelText: '跳过',
              });

              if (confirmed) {
                try {
                  const restoreResult = await restoreAutoBackup();
                  console.log('[PWA Recovery]', restoreResult.message);
                } catch (restoreErr) {
                  console.error('[PWA Recovery] Restore failed:', restoreErr);
                }
              }
            }
          }
        } catch (recoveryErr) {
          console.warn('[PWA Recovery] Check failed (non-blocking):', recoveryErr);
        }

        // Load initial data
        await refreshAll();

        // Remove splash
        onReady?.();
      } catch (err) {
        console.error('Database initialization failed:', err);
        if (!mounted) return;
        setDbError(err.message);
        setInitError(err.message);
        onReady?.();
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDbReady) return undefined;
    const intervalMinutes = Number(notificationConfig.alertCheckIntervalMinutes) || 1;
    const intervalMs = Math.max(1, intervalMinutes) * 60_000;
    const run = () => {
      checkPriceAlerts(notificationConfig, marketDataConfig).catch((error) => {
        console.warn('Price alert check failed:', error);
      });
    };
    const timer = window.setInterval(run, intervalMs);
    return () => window.clearInterval(timer);
  }, [isDbReady, notificationConfig, marketDataConfig]);

  if (initError) {
    return (
      <div className="init-error">
        <div className="init-error__icon">⚠️</div>
        <h2 className="init-error__title">数据库初始化失败</h2>
        <p className="init-error__message">{initError}</p>
        <p className="init-error__hint">
          请确保未使用隐私浏览模式，并允许网站存储数据。
        </p>
        <button
          className="init-error__retry"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </div>
    );
  }

  if (!isDbReady) {
    return <LoadingSpinner text="正在初始化数据库..." />;
  }

  return (
    <AppShell>
      <Suspense fallback={<LoadingSpinner text="正在加载页面..." />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/stock/:symbol" element={<StockDetailPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/holdings" element={<HoldingsPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/information" element={<InformationPage />} />
          <Route path="/information/:id" element={<InformationDetail />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default App;
