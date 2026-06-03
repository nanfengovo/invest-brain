import { useEffect } from 'react';
import TabBar from './TabBar';
import { useAppStore } from '../../stores/useAppStore';
import './AppShell.css';

export default function AppShell({ children }) {
  const { theme, colorConvention } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-color-mode', colorConvention);
  }, [theme, colorConvention]);

  return (
    <div className="app-shell">
      <main className="app-shell__content">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
