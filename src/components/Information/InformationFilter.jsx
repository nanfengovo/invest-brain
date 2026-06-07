import { SearchBar, Selector, Button } from 'antd-mobile';
import './InformationFilter.css';

export default function InformationFilter({
  filters,
  onChange,
  onReset,
  onClose,
  availableSectors = [],
  availableAssets = [],
  availableTags = []
}) {
  const { keyword, asset, sector, tag, groupBy = 'DAY' } = filters;

  return (
    <div className="info-filter">
      <div className="info-filter__header">
        <span className="info-filter__title">筛选与视图</span>
        <button className="info-filter__close" onClick={onClose}>✕</button>
      </div>

      <div className="info-filter__body">
        {/* Keyword Search */}
        <div className="filter-section">
          <div className="filter-section__title">标题关键词</div>
          <SearchBar
            placeholder="搜索关键词"
            value={keyword}
            onChange={(v) => onChange({ keyword: v })}
            style={{ '--background': 'var(--color-bg-secondary)' }}
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
            ]}
            value={[groupBy === 'DATE' ? 'DAY' : groupBy]}
            onChange={(v) => { if (v.length) onChange({ groupBy: v[0] }); }}
            style={{ '--padding': '6px 12px' }}
          />
        </div>

        {/* Tags */}
        {availableTags.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__title">观点标签</div>
            <Selector
              options={[
                { label: '全部标签', value: 'ALL' },
                ...availableTags.map(t => ({ label: t, value: t }))
              ]}
              value={[tag]}
              onChange={(v) => { if (v.length) onChange({ tag: v[0] }); }}
              style={{ '--padding': '6px 12px' }}
            />
          </div>
        )}

        {/* Asset */}
        {availableAssets.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__title">关联资产</div>
            <Selector
              options={[
                { label: '全部资产', value: 'ALL' },
                ...availableAssets.map(a => ({ label: a, value: a }))
              ]}
              value={[asset]}
              onChange={(v) => { if (v.length) onChange({ asset: v[0] }); }}
              style={{ '--padding': '6px 12px' }}
            />
          </div>
        )}

        {/* Sector */}
        {availableSectors.length > 0 && (
          <div className="filter-section">
            <div className="filter-section__title">关联板块</div>
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
      </div>

      <div className="info-filter__footer">
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
