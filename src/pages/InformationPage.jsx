import { useState, useEffect, useMemo } from 'react';
import { Tabs, FloatingBubble, Popup, Modal, Toast } from 'antd-mobile';
import {
  AddOutline,
  LinkOutline,
  MessageOutline,
  PictureOutline,
  VideoOutline,
  FileOutline,
  DeleteOutline,
  EyeOutline,
} from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
import InformationForm from '../components/Information/InformationForm';
import InformationFilter from '../components/Information/InformationFilter';
import AssetLogo from '../components/common/AssetLogo';
import { FilterOutline } from 'antd-mobile-icons';
import { toDateGroupKey } from '../utils/time';
import { getSyncStatusMeta } from '../utils/syncStatus';
import './InformationPage.css';

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="1em" height="1em">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

const SectorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="1em" height="1em">
    <path d="M4 5h7v7H4z" />
    <path d="M13 5h7v7h-7z" />
    <path d="M4 14h7v5H4z" />
    <path d="M13 14h7v5h-7z" />
  </svg>
);

const TYPE_ICONS = {
  ARTICLE: <FileOutline />,
  VIDEO: <VideoOutline />,
  IMAGE: <PictureOutline />,
  BOOK: <BookIcon />,
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

const META_PALETTES = {
  asset: [
    ['#60a5fa', 'rgba(96, 165, 250, 0.14)', 'rgba(96, 165, 250, 0.34)'],
    ['#34d399', 'rgba(52, 211, 153, 0.14)', 'rgba(52, 211, 153, 0.34)'],
    ['#fbbf24', 'rgba(251, 191, 36, 0.14)', 'rgba(251, 191, 36, 0.34)'],
    ['#f472b6', 'rgba(244, 114, 182, 0.14)', 'rgba(244, 114, 182, 0.34)'],
    ['#a78bfa', 'rgba(167, 139, 250, 0.14)', 'rgba(167, 139, 250, 0.34)'],
  ],
  sector: [
    ['#22d3ee', 'rgba(34, 211, 238, 0.12)', 'rgba(34, 211, 238, 0.32)'],
    ['#fb7185', 'rgba(251, 113, 133, 0.12)', 'rgba(251, 113, 133, 0.32)'],
    ['#c084fc', 'rgba(192, 132, 252, 0.12)', 'rgba(192, 132, 252, 0.32)'],
    ['#4ade80', 'rgba(74, 222, 128, 0.12)', 'rgba(74, 222, 128, 0.32)'],
    ['#facc15', 'rgba(250, 204, 21, 0.12)', 'rgba(250, 204, 21, 0.32)'],
  ],
};

function stableIndex(value, size) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return size ? hash % size : 0;
}

function getMetaStyle(kind, value) {
  const palette = META_PALETTES[kind] || META_PALETTES.asset;
  const [color, bg, border] = palette[stableIndex(value, palette.length)];
  return {
    '--meta-color': color,
    '--meta-bg': bg,
    '--meta-border': border,
  };
}

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
    groupBy: 'DAY',
  });

  const informations = useTradeStore((s) => s.informations);
  const refreshInformations = useTradeStore((s) => s.refreshInformations);
  const deleteInformation = useTradeStore((s) => s.deleteInformation);
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const isTeamWorkspace = workspaceScope === 'team';

  const handleDeleteInformation = (event, info) => {
    event.stopPropagation();
    if (isTeamWorkspace) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能删除团队情报' });
      return;
    }
    Modal.confirm({
      content: `确定删除「${info.title}」？关联观点会一起删除。`,
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        const res = await deleteInformation(info.id);
        if (res.success) {
          Toast.show({ icon: 'success', content: '已删除' });
        } else {
          Toast.show({ icon: 'fail', content: res.error || '删除失败' });
        }
      },
    });
  };

  const handleToggleTeamVisible = async (event, info) => {
    event.stopPropagation();
    if (isTeamWorkspace) {
      Toast.show({ content: '团队镜像不能直接发布或撤回，请回到个人工作区操作' });
      return;
    }
    const nextVisible = !(info.team_visible === 1 || info.team_visible === true);
    try {
      await db.setInformationTeamVisible(info.id, nextVisible);
      await refreshInformations(viewMode === 'ARCHIVED' ? 'ARCHIVED' : null);
      Toast.show({
        icon: 'success',
        content: nextVisible ? '已标记为可发布到团队' : '已撤回团队发布标记',
      });
    } catch (err) {
      Toast.show({ icon: 'fail', content: err.message || '更新团队发布标记失败' });
    }
  };

  const openInformation = (event, info) => {
    event.stopPropagation();
    navigate(`/information/${info.id}`);
  };

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
        {isTeamWorkspace && <span className="info-page__workspace-note">团队镜像只读</span>}
      </div>

      <div className="info-page__list info-page__list--compact">
        {filteredInfo.length === 0 ? (
          <div className="info-page__empty">
            <div className="info-page__empty-icon">📝</div>
            <div className="info-page__empty-title">暂无相关情报</div>
            <div className="info-page__empty-subtitle">记录你的第一条投资线索</div>
          </div>
        ) : (
          Object.entries(
            filteredInfo.reduce((groups, info) => {
              const key = toDateGroupKey(info.created_at, filters.groupBy === 'DATE' ? 'DAY' : filters.groupBy);
              if (!groups[key]) groups[key] = [];
              groups[key].push(info);
              return groups;
            }, {})
          ).map(([dateKey, items]) => (
            <div key={dateKey} className="info-timeline-group">
              <div className="info-timeline-group__header">{dateKey}</div>
              <div className="info-timeline-group__items">
                {items.map(info => {
                  const infoAssets = splitList(info.asset_symbols || info.asset_symbol || info.asset_id);
                  const infoSectors = splitList(info.sectors || info.sector);
                  const syncMeta = getSyncStatusMeta(info);
                  const isTeamVisible = info.team_visible === 1 || info.team_visible === true;

                  return (
                    <div
                      key={info.id}
                      className={`info-row info-row--${String(info.type || 'ARTICLE').toLowerCase()}`}
                      onClick={() => navigate(`/information/${info.id}`)}
                    >
                      <div className="info-row__type">
                        <span className="info-row__type-icon">{TYPE_ICONS[info.type] || <LinkOutline />}</span>
                      </div>
                      <div className="info-row__main">
                        <div className="info-row__title">{info.title}</div>
                        <div className="info-row__meta">
                          {infoAssets.slice(0, 2).map((asset) => (
                            <span
                              key={asset}
                              className="info-row__pill info-row__pill--asset"
                              style={getMetaStyle('asset', asset)}
                            >
                              <AssetLogo symbol={asset} className="info-row__asset-logo" />
                              {asset}
                            </span>
                          ))}
                          {infoSectors.slice(0, 2).map((sector) => (
                            <span
                              key={sector}
                              className="info-row__pill info-row__pill--sector"
                              style={getMetaStyle('sector', sector)}
                            >
                              <SectorIcon />
                              {sector}
                            </span>
                          ))}
                          <span className="info-row__pill info-row__pill--neutral">
                            <MessageOutline />
                            {info.viewpoint_count || 0}
                          </span>
                          {info.decision_count > 0 && (
                            <span className="info-row__pill info-row__pill--neutral">
                              <FileOutline />
                              {info.decision_count}
                            </span>
                          )}
                          <span className={`info-row__pill info-row__pill--sync ${syncMeta.className}`}>
                            {syncMeta.label}
                          </span>
                        </div>
                      </div>
                      <div className="info-row__side" onClick={(event) => event.stopPropagation()}>
                        <span className={`info-row__badge badge-${String(info.type || 'ARTICLE').toLowerCase()}`}>
                          {TYPE_LABELS[info.type] || info.type}
                        </span>
                        <div className="info-row__actions">
                          {!isTeamWorkspace && (
                            <button
                              type="button"
                              className={`info-row__publish-btn ${isTeamVisible ? 'info-row__publish-btn--active' : ''}`}
                              onClick={(event) => handleToggleTeamVisible(event, info)}
                            >
                              {isTeamVisible ? '撤回' : '发布'}
                            </button>
                          )}
                          <button type="button" className="info-row__icon-btn" onClick={(event) => openInformation(event, info)}>
                            <EyeOutline />
                          </button>
                          {!isTeamWorkspace && (
                            <button type="button" className="info-row__icon-btn info-row__icon-btn--danger" onClick={(event) => handleDeleteInformation(event, info)}>
                              <DeleteOutline />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {!isTeamWorkspace && (
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
      )}

      <Popup
        visible={showFilter}
        onMaskClick={() => setShowFilter(false)}
        position="right"
        bodyStyle={{ width: '85vw' }}
      >
        <InformationFilter
          filters={filters}
          onChange={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
          onReset={() => setFilters({ keyword: '', asset: 'ALL', sector: 'ALL', tag: 'ALL', groupBy: 'DAY' })}
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
