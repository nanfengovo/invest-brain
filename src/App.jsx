import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from './stores/useAppStore';
import { useTradeStore } from './stores/useTradeStore';
import { initDB } from './db/database';
import AppShell from './components/Layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import TradesPage from './pages/TradesPage';
import DecisionsPage from './pages/DecisionsPage';
import SettingsPage from './pages/SettingsPage';
import InformationPage from './pages/InformationPage';
import InformationDetail from './pages/InformationDetail';
import LoadingSpinner from './components/common/LoadingSpinner';

function App({ onReady }) {
  const [initError, setInitError] = useState(null);
  const { isDbReady, setDbReady, setDbError } = useAppStore();
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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trades" element={<TradesPage />} />
        <Route path="/decisions" element={<DecisionsPage />} />
        <Route path="/information" element={<InformationPage />} />
        <Route path="/information/:id" element={<InformationDetail />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
