import { useState, useEffect, useMemo } from 'react';
import { Tabs, FloatingBubble, Popup, Card, Tag } from 'antd-mobile';
import { AddOutline, LinkOutline, PictureOutline, VideoOutline, FileOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import InformationForm from '../components/Information/InformationForm';
import InformationFilter from '../components/Information/InformationFilter';
import { FilterOutline } from 'antd-mobile-icons';
import './InformationPage.css';

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="1em" height="1em">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

const TYPE_ICONS = {
  ARTICLE: <FileOutline />,
  VIDEO: <VideoOutline />,
  IMAGE: <PictureOutline />,
  BOOK: <BookIcon />,
};

const TYPE_COLORS = {
  ARTICLE: 'primary',
  VIDEO: 'danger',
  IMAGE: 'success',
  BOOK: 'warning',
};

const TYPE_LABELS = {
  ARTICLE: '文章',
  VIDEO: '视频',
  IMAGE: '图片',
  BOOK: '书籍',
};

const splitList = (value) => String(value || '')
  .split(/[,\n，、]/)
  .map((item) => item.trim())
  .filter(Boolean);

export default function InformationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ALL');
  const [viewMode, setViewMode] = useState('INBOX'); // 'INBOX' or 'ARCHIVED'
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const [filters, setFilters] = useState({
    keyword: '',
    asset: 'ALL',
    sector: 'ALL',
    tag: 'ALL',
  });

  const informations = useTradeStore((s) => s.informations);
  const refreshInformations = useTradeStore((s) => s.refreshInformations);

  const stats = useMemo(() => {
    const total = informations.length;
    const articles = informations.filter(i => i.type === 'ARTICLE').length;
    const videos = informations.filter(i => i.type === 'VIDEO').length;
    const images = informations.filter(i => i.type === 'IMAGE').length;
    const books = informations.filter(i => i.type === 'BOOK').length;
    return { total, articles, videos, images, books };
  }, [informations]);

  // Fetch data based on viewMode
  useEffect(() => {
    refreshInformations(viewMode === 'ARCHIVED' ? 'ARCHIVED' : null);
  }, [viewMode, refreshInformations]);

  // Extract available filters dynamically
  const availableAssets = useMemo(() => {
    const assets = new Set(
      informations.flatMap(i => splitList(i.asset_symbols || i.asset_symbol || i.asset_id))
    );
    return Array.from(assets);
  }, [informations]);

  const availableSectors = useMemo(() => {
    const sectors = new Set(
      informations.flatMap(i => splitList(i.sectors || i.sector))
    );
    return Array.from(sectors);
  }, [informations]);

  const availableTags = useMemo(() => {
    // Collect all tags from viewpoints
    // But viewpoints are async, so maybe we just rely on tags stored in informations?
    // In our schema, info.viewpoints is not directly in `informations` array unless we joined it.
    // For now, let's keep it simple or just leave tags if they are in info.tags (not standard).
    return [];
  }, [informations]);

  const filteredInfo = useMemo(() => {
    let result = informations;
    if (activeTab !== 'ALL') {
      result = result.filter(i => i.type === activeTab);
    }

    // Apply filters
    result = result.filter(i => {
      if (filters.keyword && !(
        (i.title && i.title.toLowerCase().includes(filters.keyword.toLowerCase())) ||
        (i.content && i.content.toLowerCase().includes(filters.keyword.toLowerCase()))
      )) {
        return false;
      }
      const infoAssets = splitList(i.asset_symbols || i.asset_symbol || i.asset_id);
      const infoSectors = splitList(i.sectors || i.sector);
      if (filters.asset !== 'ALL' && !infoAssets.includes(filters.asset)) return false;
      if (filters.sector !== 'ALL' && !infoSectors.includes(filters.sector)) return false;
      // Tag filtering would require viewpoint tags, omit for now if not available
      return true;
    });

    return result;
  }, [informations, activeTab, filters]);

  return (
    <div className="info-page">
      <div className="info-page__header">
        <h1>情报与资讯</h1>
        <div className="info-page__capsule-toggle">
          <div
            className={`info-page__capsule-option ${viewMode === 'INBOX' ? 'active' : ''}`}
            onClick={() => setViewMode('INBOX')}
          >
            收件箱
          </div>
          <div
            className={`info-page__capsule-option ${viewMode === 'ARCHIVED' ? 'active' : ''}`}
            onClick={() => setViewMode('ARCHIVED')}
          >
            已归档
          </div>
        </div>
        <div className="info-page__header-actions">
          <div className="info-page__action-btn" onClick={() => setShowFilter(true)}>
            <FilterOutline />
            {(filters.keyword || filters.asset !== 'ALL' || filters.sector !== 'ALL') && (
              <div className="info-page__action-dot" />
            )}
          </div>
        </div>
      </div>

      <div className="info-page__tabs">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.Tab title="全部" key="ALL" />
          <Tabs.Tab title="文章" key="ARTICLE" />
          <Tabs.Tab title="视频" key="VIDEO" />
          <Tabs.Tab title="图片" key="IMAGE" />
          <Tabs.Tab title="书籍" key="BOOK" />
        </Tabs>
      </div>

      <div className="info-page__stats">
        共 <span className="info-page__stats-highlight">{stats.total}</span> 条情报 · 文章 <span className="info-page__stats-highlight">{stats.articles}</span> · 视频 <span className="info-page__stats-highlight">{stats.videos}</span>
      </div>

      <div className="info-page__list">
        {filteredInfo.length === 0 ? (
          <div className="info-page__empty">
            <div className="info-page__empty-icon">📝</div>
            <div className="info-page__empty-title">暂无相关情报</div>
            <div className="info-page__empty-subtitle">记录你的第一条投资线索</div>
          </div>
        ) : (
          filteredInfo.map(info => {
            const infoAssets = splitList(info.asset_symbols || info.asset_symbol || info.asset_id);
            const infoSectors = splitList(info.sectors || info.sector);

            return (
              <div
                key={info.id}
                className="info-card-premium"
                onClick={() => navigate(`/information/${info.id}`)}
              >
                <div className="info-card-premium__header">
                  <div className="info-card-premium__title">{info.title}</div>
                  <div className={`info-card-premium__badge badge-${info.type.toLowerCase()}`}>
                    {TYPE_LABELS[info.type] || info.type}
                  </div>
                </div>

                {info.content && (
                  <div className="info-card-premium__preview">
                    {info.content.length > 80 ? info.content.substring(0, 80) + '...' : info.content}
                  </div>
                )}

                <div className="info-card-premium__footer">
                  <div className="info-card-premium__meta">
                    <div className="info-card-premium__meta-item">
                      {TYPE_ICONS[info.type] || <LinkOutline />}
                    </div>
                    {infoAssets.slice(0, 3).map((asset) => (
                      <div key={asset} className="info-card-premium__tag">
                        {asset}
                      </div>
                    ))}
                    {infoSectors.slice(0, 3).map((sector) => (
                      <div key={sector} className="info-card-premium__tag">
                        {sector}
                      </div>
                    ))}
                    <div className="info-card-premium__meta-item">
                      评论: {info.viewpoint_count || 0}
                    </div>
                    {info.decision_count > 0 && (
                      <div className="info-card-premium__meta-item">
                        决策: {info.decision_count}
                      </div>
                    )}
                  </div>
                  <div className="info-card-premium__date">
                    {new Date(info.created_at * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <FloatingBubble
        style={{
          '--initial-position-bottom': '80px',
          '--initial-position-right': '24px',
          '--edge-distance': '24px',
        }}
        onClick={() => setShowAdd(true)}
      >
        <AddOutline fontSize={28} />
      </FloatingBubble>

      <Popup
        visible={showFilter}
        onMaskClick={() => setShowFilter(false)}
        position="right"
        bodyStyle={{ width: '85vw' }}
      >
        <InformationFilter
          filters={filters}
          onChange={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
          onReset={() => setFilters({ keyword: '', asset: 'ALL', sector: 'ALL', tag: 'ALL' })}
          onClose={() => setShowFilter(false)}
          availableAssets={availableAssets}
          availableSectors={availableSectors}
          availableTags={availableTags}
        />
      </Popup>

      <Popup
        visible={showAdd}
        onMaskClick={() => setShowAdd(false)}
        position="bottom"
        bodyStyle={{ height: '90vh' }}
      >
        <InformationForm onClose={() => setShowAdd(false)} />
      </Popup>
    </div>
  );
}
