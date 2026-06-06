import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import TabBar from './TabBar';
import { useAppStore } from '../../stores/useAppStore';
import './AppShell.css';

export default function AppShell({ children }) {
  const { theme, colorConvention } = useAppStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-color-mode', colorConvention);
  }, [theme, colorConvention]);

  // Hide tab bar on detail pages and insights page
  const hideTabBar = location.pathname.match(/^\/(information)\/.+/) || location.pathname === '/insights';
  const routeClass = location.pathname === '/market' ? ' app-shell--market' : '';

  return (
    <div className={`app-shell${routeClass}`}>
      <main className="app-shell__content">
        {children}
      </main>
      {!hideTabBar && <TabBar />}
    </div>
  );
}
