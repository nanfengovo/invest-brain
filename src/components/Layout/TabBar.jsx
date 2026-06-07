import { TabBar as AdmTabBar } from 'antd-mobile';
import { AppOutline, HistogramOutline, SetOutline, CompassOutline } from 'antd-mobile-icons';
import { useNavigate, useLocation } from 'react-router-dom';
import './TabBar.css';

/**
 * Custom lightbulb icon — BulbOutline is not available in antd-mobile-icons.
 */
const BulbIcon = () => (
  <svg
    viewBox="0 0 1024 1024"
    width="1em"
    height="1em"
    fill="currentColor"
  >
    <path d="M512 64C317.9 64 160 221.9 160 416c0 120.4 60.7 226.8 153.1 290.1 24.5 16.8 38.9 44.7 38.9 74.5V832c0 35.3 28.7 64 64 64h192c35.3 0 64-28.7 64-64v-51.4c0-29.8 14.4-57.7 38.9-74.5C803.3 642.8 864 536.4 864 416 864 221.9 706.1 64 512 64zm0 64c141 0 288 121.5 288 288 0 99.5-50.2 187.5-126.6 239.8-30.6 21-51.2 53.5-58.3 90.2H408.9c-7.1-36.7-27.7-69.2-58.3-90.2C274.2 603.5 224 515.5 224 416c0-166.5 147-288 288-288zM384 864h256v-16H384v16zm48 64h160a16 16 0 0 0 0-32H432a16 16 0 0 0 0 32z" />
  </svg>
);

/**
 * Custom pie chart icon for Holdings tab.
 */
const PieIcon = () => (
  <svg
    viewBox="0 0 1024 1024"
    width="1em"
    height="1em"
    fill="currentColor"
  >
    <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372 0-205.4 166.6-372 372-372V512l263.1 263.1C707.7 843.4 614.3 884 512 884z" />
  </svg>
);

/**
 * Custom chart icon for Market tab.
 */
const MarketIcon = () => (
  <svg
    viewBox="0 0 1024 1024"
    width="1em"
    height="1em"
    fill="currentColor"
  >
    <path d="M888 792H200V168c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v688c0 4.4 3.6 8 8 8h752c4.4 0 8-3.6 8-8v-56c0-4.4-3.6-8-8-8zM305.8 637.7c3.1 3.1 8.1 3.1 11.3 0l138.3-137.6L583 628.5c3.1 3.1 8.2 3.1 11.3 0l275.4-275.3c3.1-3.1 3.1-8.2 0-11.3l-39.6-39.6a8.03 8.03 0 0 0-11.3 0l-230 229.9L461.4 404a8.03 8.03 0 0 0-11.3 0L266.3 586.7a8.03 8.03 0 0 0 0 11.3l39.5 39.7z" />
  </svg>
);

const tabs = [
  { key: '/', title: '看板', icon: <AppOutline /> },
  { key: '/market', title: '行情', icon: <MarketIcon /> },
  { key: '/trades', title: '交易', icon: <HistogramOutline /> },
  { key: '/holdings', title: '持仓', icon: <PieIcon /> },
  { key: '/information', title: '情报', icon: <CompassOutline /> },
  { key: '/settings', title: '我的', icon: <SetOutline /> },
];

export default function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /* Match current route to active tab key */
  const activeKey = tabs.find((t) => {
    if (t.key === '/') return pathname === '/';
    return pathname.startsWith(t.key);
  })?.key ?? '/';

  return (
    <div className="tabbar">
      <AdmTabBar
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        safeArea={false}
      >
        {tabs.map((tab) => (
          <AdmTabBar.Item
            key={tab.key}
            icon={tab.icon}
            title={tab.title}
          />
        ))}
      </AdmTabBar>
    </div>
  );
}
