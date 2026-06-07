import { SearchBar, Selector, Button } from 'antd-mobile';
import './TradeFilter.css';

export default function TradeFilter({
  filters,
  onChange,
  onReset,
  onClose,
  availableSectors = []
}) {
  const { symbol, sector, direction, lifecycle = 'ALL', groupBy, compactMode } = filters;

  return (
    <div className="trade-filter">
      <div className="trade-filter__header">
        <span className="trade-filter__title">筛选与视图</span>
        <button className="trade-filter__close" onClick={onClose}>✕</button>
      </div>

      <div className="trade-filter__body">
        {/* Symbol Search */}
        <div className="filter-section">
          <div className="filter-section__title">股票代码</div>
          <SearchBar
            placeholder="搜索代码 (如: AAPL)"
            value={symbol}
            onChange={(v) => onChange({ symbol: v.toUpperCase() })}
            style={{ '--background': 'var(--color-bg-secondary)' }}
          />
        </div>

        {/* Direction */}
        <div className="filter-section">
          <div className="filter-section__title">交易方向</div>
          <Selector
            options={[
              { label: '全部', value: 'ALL' },
              { label: '买入 (Buy)', value: 'BUY' },
              { label: '卖出 (Sell)', value: 'SELL' },
            ]}
            value={[direction]}
            onChange={(v) => { if (v.length) onChange({ direction: v[0] }); }}
            style={{ '--padding': '6px 12px' }}
          />
        </div>

        {/* Sector */}
        {availableSectors.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__title">资产板块</div>
            <Selector
              options={[
                { label: '全部板块', value: 'ALL' },
                ...availableSectors.map(s => ({ label: s, value: s }))
              ]}
              value={[sector]}
              onChange={(v) => { if (v.length) onChange({ sector: v[0] }); }}
              style={{ '--padding': '6px 12px' }}
            />
          </div>
        )}

        {/* Lifecycle */}
        <div className="filter-section">
          <div className="filter-section__title">闭环状态</div>
          <Selector
            options={[
              { label: '全部', value: 'ALL' },
              { label: '未卖出', value: 'OPEN_ONLY' },
              { label: '部分卖出', value: 'PARTIAL' },
              { label: '已闭环', value: 'CLOSED' },
            ]}
            value={[lifecycle]}
            onChange={(v) => { if (v.length) onChange({ lifecycle: v[0] }); }}
            style={{ '--padding': '6px 12px' }}
          />
        </div>

        {/* Grouping */}
        <div className="filter-section">
          <div className="filter-section__title">视图聚合方式</div>
          <Selector
            options={[
              { label: '按日聚合', value: 'DAY' },
              { label: '按周聚合', value: 'WEEK' },
              { label: '按月聚合', value: 'MONTH' },
              { label: '按标的聚合', value: 'ASSET' },
              { label: '不聚合(平铺)', value: 'NONE' },
            ]}
            value={[groupBy === 'DATE' ? 'DAY' : groupBy]}
            onChange={(v) => { if (v.length) onChange({ groupBy: v[0] }); }}
            style={{ '--padding': '6px 12px' }}
          />
        </div>

        {/* Compact Mode */}
        <div className="filter-section">
          <div className="filter-section__title">显示模式</div>
          <Selector
            options={[
              { label: '紧凑列表 (流水)', value: 'true' },
              { label: '详细大卡片', value: 'false' },
            ]}
            value={[compactMode ? 'true' : 'false']}
            onChange={(v) => { if (v.length) onChange({ compactMode: v[0] === 'true' }); }}
            style={{ '--padding': '6px 12px' }}
          />
        </div>
      </div>

      <div className="trade-filter__footer">
        <Button onClick={onReset} size="middle" className="btn-reset">
          重置
        </Button>
        <Button color="primary" onClick={onClose} size="middle" style={{ flex: 1 }}>
          完成
        </Button>
      </div>
    </div>
  );
}
