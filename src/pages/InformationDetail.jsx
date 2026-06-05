import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Button, Toast, Tag, TextArea, Divider, List, ActionSheet, SwipeAction, Modal, Popup, Selector, Input } from 'antd-mobile';
import { LinkOutline, AppstoreOutline, MoreOutline, EditSOutline, AddOutline } from 'antd-mobile-icons';
import { db } from '../db/database';
import { useTradeStore } from '../stores/useTradeStore';
import { getFileUrlFromOPFS } from '../utils/opfsUtils';
import LoadingSpinner from '../components/common/LoadingSpinner';
import './InformationDetail.css';

const TYPE_LABELS = {
  ARTICLE: '文章',
  VIDEO: '视频',
  IMAGE: '图片',
  BOOK: '书籍',
};

const TYPE_COLORS = {
  ARTICLE: 'primary',
  VIDEO: 'danger',
  IMAGE: 'success',
  BOOK: 'warning',
};

const TYPE_OPTIONS = [
  { label: '文章', value: 'ARTICLE' },
  { label: '视频', value: 'VIDEO' },
  { label: '图表/图片', value: 'IMAGE' },
  { label: '书籍/研报', value: 'BOOK' },
];

// Viewpoint tag presets
const VP_TAG_PRESETS = [
  { label: '看多', value: '看多', color: '#22c55e' },
  { label: '看空', value: '看空', color: '#ef4444' },
  { label: '短期', value: '短期', color: '#f59e0b' },
  { label: '长期', value: '长期', color: '#3b82f6' },
  { label: '基本面', value: '基本面', color: '#8b5cf6' },
  { label: '技术面', value: '技术面', color: '#06b6d4' },
  { label: '关键事件', value: '关键事件', color: '#ec4899' },
  { label: '风险', value: '风险', color: '#f97316' },
];

const VP_STATUS_CONFIG = {
  ACTIVE: { label: '活跃', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  VALIDATED: { label: '已验证', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  INVALIDATED: { label: '已失效', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  ARCHIVED: { label: '已归档', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

/**
 * Convert a Unix timestamp (seconds) to locale date string.
 */
function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN');
}

/**
 * Extract a displayable domain from a URL.
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') || u.pathname.split('/embed/')[1] || null;
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch { /* ignore */ }
  return null;
}

function getBilibiliId(url) {
  if (!url) return null;
  try {
    const match = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
    return match ? match[1] : null;
  } catch { /* ignore */ }
  return null;
}

function isTwitterUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com');
  } catch { return false; }
}

/**
 * Parse tags from JSON string or return empty array
 */
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get color for a viewpoint tag
 */
function getTagColor(tag) {
  const preset = VP_TAG_PRESETS.find(p => p.value === tag);
  return preset ? preset.color : '#6366f1';
}

export default function InformationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewpoints, setViewpoints] = useState([]);
  const [fileUrl, setFileUrl] = useState(null);
  const [contentCollapsed, setContentCollapsed] = useState(false);
  
  const [newViewpoint, setNewViewpoint] = useState('');
  const [newVpTags, setNewVpTags] = useState([]);
  const [submittingVp, setSubmittingVp] = useState(false);
  
  // Tag editing state
  const [editTypeVisible, setEditTypeVisible] = useState(false);
  const [editAssetVisible, setEditAssetVisible] = useState(false);
  const [editSectorVisible, setEditSectorVisible] = useState(false);
  const [editAssetValue, setEditAssetValue] = useState('');
  const [editSectorValue, setEditSectorValue] = useState('');
  
  const addViewpoint = useTradeStore(s => s.addViewpoint);
  const updateViewpoint = useTradeStore(s => s.updateViewpoint);

  useEffect(() => {
    let currentUrl = null;
    async function loadData() {
      try {
        const infoData = await db.getInformationById(id);
        if (!infoData) {
          Toast.show({ icon: 'fail', content: '找不到该情报' });
          navigate(-1);
          return;
        }
        setInfo(infoData);
        setEditAssetValue(infoData.asset_symbol || infoData.asset_id || '');
        setEditSectorValue(infoData.sector || '');
        
        const vps = await db.getViewpoints(id);
        setViewpoints(vps || []);

        if (infoData.file_path) {
          currentUrl = await getFileUrlFromOPFS(infoData.file_path);
          setFileUrl(currentUrl);
        }
      } catch (err) {
        console.error('Failed to load information details:', err);
        Toast.show({ icon: 'fail', content: '加载失败' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
    
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [id, navigate]);

  const handleAddViewpoint = async () => {
    if (!newViewpoint.trim()) return;
    setSubmittingVp(true);
    try {
      const res = await addViewpoint({
        id: crypto.randomUUID(),
        info_id: id,
        content: newViewpoint.trim(),
        tags: newVpTags.length > 0 ? newVpTags : null,
      });
      if (res.success) {
        Toast.show({ icon: 'success', content: '添加成功' });
        setNewViewpoint('');
        setNewVpTags([]);
        const vps = await db.getViewpoints(id);
        setViewpoints(vps || []);
      } else {
        Toast.show({ icon: 'fail', content: '添加失败' });
      }
    } finally {
      setSubmittingVp(false);
    }
  };

  const handleCreateDecision = () => {
    navigate(`/decisions?info_id=${id}`);
  };

  // Tag editing handlers
  const handleEditType = async (typeArr) => {
    if (!typeArr || typeArr.length === 0) return;
    const newType = typeArr[0];
    const updateInformation = useTradeStore.getState().updateInformation;
    const res = await updateInformation({ ...info, type: newType });
    if (res.success) {
      setInfo(prev => ({ ...prev, type: newType }));
      Toast.show({ icon: 'success', content: '类型已更新' });
    }
    setEditTypeVisible(false);
  };

  const handleEditAsset = async () => {
    const symbol = editAssetValue.toUpperCase().trim();
    const updateInformation = useTradeStore.getState().updateInformation;
    
    let assetId = null;
    if (symbol) {
      try {
        await db.upsertAsset({ id: symbol, symbol, name: symbol, type: 'STOCK' });
        assetId = symbol;
      } catch (err) {
        console.warn('Asset upsert failed:', err);
      }
    }
    
    const res = await updateInformation({ ...info, asset_id: assetId });
    if (res.success) {
      setInfo(prev => ({ ...prev, asset_id: assetId, asset_symbol: symbol || null }));
      Toast.show({ icon: 'success', content: symbol ? '关联资产已更新' : '已取消关联' });
    }
    setEditAssetVisible(false);
  };

  const handleEditSector = async () => {
    const sector = editSectorValue.trim() || null;
    const updateInformation = useTradeStore.getState().updateInformation;
    const res = await updateInformation({ ...info, sector });
    if (res.success) {
      setInfo(prev => ({ ...prev, sector }));
      Toast.show({ icon: 'success', content: sector ? '板块已更新' : '已清除板块' });
    }
    setEditSectorVisible(false);
  };

  const handleViewpointStatusChange = async (vpId, newStatus) => {
    const updateVpStatus = useTradeStore.getState().updateViewpointStatus;
    const res = await updateVpStatus(vpId, newStatus);
    if (res.success) {
      const vps = await db.getViewpoints(id);
      setViewpoints(vps || []);
      Toast.show({ icon: 'success', content: `已标记为${VP_STATUS_CONFIG[newStatus]?.label || newStatus}` });
    }
  };

  // Determine embed type
  const youtubeId = useMemo(() => info?.url ? getYouTubeId(info.url) : null, [info?.url]);
  const bilibiliId = useMemo(() => info?.url ? getBilibiliId(info.url) : null, [info?.url]);
  const isTwitter = useMemo(() => isTwitterUrl(info?.url), [info?.url]);

  // Content: show full by default, allow collapse for very long content
  const COLLAPSE_THRESHOLD = 800;
  const isLongContent = info?.content && info.content.length > COLLAPSE_THRESHOLD;
  const displayContent = isLongContent && contentCollapsed
    ? info.content.slice(0, COLLAPSE_THRESHOLD) + '...'
    : info?.content;

  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const deleteInformation = useTradeStore(s => s.deleteInformation);
  const updateInformation = useTradeStore(s => s.updateInformation);

  const handleAction = async (action) => {
    setActionSheetVisible(false);
    if (action.key === 'archive') {
      const res = await updateInformation({ ...info, status: 'ARCHIVED' });
      if (res.success) {
        Toast.show({ icon: 'success', content: '已归档' });
        navigate(-1);
      }
    } else if (action.key === 'delete') {
      Modal.confirm({
        content: '确定要删除这条情报及所有关联观点吗？',
        onConfirm: async () => {
          const res = await deleteInformation(info.id);
          if (res.success) {
            Toast.show({ icon: 'success', content: '已删除' });
            navigate(-1);
          } else {
            Toast.show({ icon: 'fail', content: '删除失败' });
          }
        },
      });
    }
  };

  const actionSheetActions = [
    { text: '归档', key: 'archive' },
    { text: '删除', key: 'delete', danger: true },
  ];

  // Build swipe actions for viewpoint based on its current status
  const getVpSwipeActions = (vp) => {
    const status = vp.status || 'ACTIVE';
    const actions = [];
    
    if (status !== 'VALIDATED') {
      actions.push({
        key: 'validate',
        text: '验证',
        color: '#3b82f6',
        onClick: () => handleViewpointStatusChange(vp.id, 'VALIDATED'),
      });
    }
    if (status !== 'INVALIDATED') {
      actions.push({
        key: 'invalidate',
        text: '失效',
        color: '#f59e0b',
        onClick: () => handleViewpointStatusChange(vp.id, 'INVALIDATED'),
      });
    }
    if (status !== 'ARCHIVED') {
      actions.push({
        key: 'archive',
        text: '归档',
        color: '#6b7280',
        onClick: () => handleViewpointStatusChange(vp.id, 'ARCHIVED'),
      });
    }
    actions.push({
      key: 'delete',
      text: '删除',
      color: 'danger',
      onClick: async () => {
        const res = await useTradeStore.getState().deleteViewpoint(vp.id);
        if (res.success) {
          Toast.show({ icon: 'success', content: '观点已删除' });
          const newVps = await db.getViewpoints(id);
          setViewpoints(newVps || []);
        } else {
          Toast.show({ icon: 'fail', content: '删除失败' });
        }
      },
    });
    return actions;
  };

  if (loading) return <LoadingSpinner />;
  if (!info) return null;

  return (
    <div className="info-detail">
      <NavBar 
        onBack={() => navigate(-1)}
        right={<MoreOutline style={{ fontSize: 24 }} onClick={() => setActionSheetVisible(true)} />}
      >
        情报详情
      </NavBar>

      <ActionSheet
        visible={actionSheetVisible}
        actions={actionSheetActions}
        onClose={() => setActionSheetVisible(false)}
        onAction={handleAction}
        cancelText="取消"
      />
      
      <div className="info-detail__content">
        <div className="info-detail__header">
          <h1 className="info-detail__title">{info.title}</h1>
          
          {/* ── Editable Tags ── */}
          <div className="info-detail__tags">
            <Tag 
              color={TYPE_COLORS[info.type] || 'default'} 
              fill="outline"
              className="info-detail__tag-editable"
              onClick={() => setEditTypeVisible(true)}
            >
              {TYPE_LABELS[info.type] || info.type}
              <EditSOutline className="info-detail__tag-edit-icon" />
            </Tag>
            
            {info.asset_symbol || info.asset_id ? (
              <Tag 
                color="primary" 
                fill="outline"
                className="info-detail__tag-editable"
                onClick={() => {
                  setEditAssetValue(info.asset_symbol || info.asset_id || '');
                  setEditAssetVisible(true);
                }}
              >
                <AppstoreOutline style={{ marginRight: 4 }} />
                {info.asset_symbol || info.asset_id}
                <EditSOutline className="info-detail__tag-edit-icon" />
              </Tag>
            ) : (
              <Tag 
                color="default" 
                fill="outline"
                className="info-detail__tag-add"
                onClick={() => {
                  setEditAssetValue('');
                  setEditAssetVisible(true);
                }}
              >
                <AddOutline style={{ marginRight: 2 }} />
                关联资产
              </Tag>
            )}
            
            {info.sector ? (
              <Tag 
                color="success" 
                fill="outline"
                className="info-detail__tag-editable"
                onClick={() => {
                  setEditSectorValue(info.sector || '');
                  setEditSectorVisible(true);
                }}
              >
                {info.sector}
                <EditSOutline className="info-detail__tag-edit-icon" />
              </Tag>
            ) : (
              <Tag 
                color="default" 
                fill="outline"
                className="info-detail__tag-add"
                onClick={() => {
                  setEditSectorValue('');
                  setEditSectorVisible(true);
                }}
              >
                <AddOutline style={{ marginRight: 2 }} />
                板块
              </Tag>
            )}
            
            {info.source === 'AI' && (
              <Tag color="warning" fill="outline">AI-</Tag>
            )}
          </div>
          
          <div className="info-detail__date">
            创建于 {formatTimestamp(info.created_at)}
          </div>
        </div>

        {/* ── Type Editing Popup ── */}
        <Popup
          visible={editTypeVisible}
          onMaskClick={() => setEditTypeVisible(false)}
          position="bottom"
          bodyClassName="info-detail__edit-popup"
        >
          <div className="info-detail__edit-popup-content">
            <div className="info-detail__edit-popup-title">选择类型</div>
            <Selector
              options={TYPE_OPTIONS}
              value={[info.type]}
              onChange={handleEditType}
              columns={2}
            />
          </div>
        </Popup>

        {/* ── Asset Editing Popup ── */}
        <Popup
          visible={editAssetVisible}
          onMaskClick={() => setEditAssetVisible(false)}
          position="bottom"
          bodyClassName="info-detail__edit-popup"
        >
          <div className="info-detail__edit-popup-content">
            <div className="info-detail__edit-popup-title">关联资产代码</div>
            <Input
              placeholder="如: AAPL, BTC, MRVL"
              value={editAssetValue}
              onChange={setEditAssetValue}
              clearable
              className="info-detail__edit-input"
            />
            <div className="info-detail__edit-actions">
              <Button size="small" onClick={() => setEditAssetVisible(false)}>取消</Button>
              <Button size="small" color="primary" onClick={handleEditAsset}>确定</Button>
            </div>
          </div>
        </Popup>

        {/* ── Sector Editing Popup ── */}
        <Popup
          visible={editSectorVisible}
          onMaskClick={() => setEditSectorVisible(false)}
          position="bottom"
          bodyClassName="info-detail__edit-popup"
        >
          <div className="info-detail__edit-popup-content">
            <div className="info-detail__edit-popup-title">关联板块</div>
            <Input
              placeholder="如: 科技, AI, 半导体"
              value={editSectorValue}
              onChange={setEditSectorValue}
              clearable
              className="info-detail__edit-input"
            />
            <div className="info-detail__edit-actions">
              <Button size="small" onClick={() => setEditSectorVisible(false)}>取消</Button>
              <Button size="small" color="primary" onClick={handleEditSector}>确定</Button>
            </div>
          </div>
        </Popup>

        {/* ── Video Embed (YouTube / Bilibili) ── */}
        {youtubeId && (
          <div className="info-detail__embed">
            <div className="info-detail__embed-player">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title="YouTube player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {bilibiliId && (
          <div className="info-detail__embed">
            <div className="info-detail__embed-player">
              <iframe
                src={`https://player.bilibili.com/player.html?bvid=${bilibiliId}&high_quality=1&danmaku=0`}
                title="Bilibili player"
                allowFullScreen
                scrolling="no"
              />
            </div>
          </div>
        )}

        {/* ── Link Preview Card ── */}
        {info.url && !youtubeId && !bilibiliId && (
          <div className="info-detail__link-card">
            <div className="info-detail__link-card-icon">
              <img
                src={`https://www.google.com/s2/favicons?domain=${extractDomain(info.url)}&sz=32`}
                alt=""
                width="20"
                height="20"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            <div className="info-detail__link-card-body">
              <div className="info-detail__link-card-domain">{extractDomain(info.url)}</div>
              <div className="info-detail__link-card-url">{info.url}</div>
            </div>
            <a
              href={info.url}
              target="_blank"
              rel="noreferrer"
              className="info-detail__link-card-btn"
            >
              {isTwitter ? '打开 𝕏' : '打开链接'}
            </a>
          </div>
        )}

        {/* ── Uploaded Media (OPFS file) ── */}
        {fileUrl && (
          <div className="info-detail__media">
            {info.type === 'VIDEO' ? (
              <video src={fileUrl} controls className="info-detail__video" />
            ) : (
              <img src={fileUrl} alt="附件" className="info-detail__image" />
            )}
          </div>
        )}

        {/* ── Content Body — Full Display ── */}
        {info.content && (
          <div className="info-detail__body glass-card">
            <div className="info-detail__body-label">正文内容</div>
            <div className="info-detail__body-text">
              {displayContent}
            </div>
            {isLongContent && (
              <button
                className="info-detail__body-toggle"
                onClick={() => setContentCollapsed(!contentCollapsed)}
              >
                {contentCollapsed ? '展开全文 ▼' : '收起 ▲'}
              </button>
            )}
          </div>
        )}

        <Divider>标注与观点</Divider>

        {/* ── Viewpoints List ── */}
        <div className="info-detail__viewpoints">
          {viewpoints.length === 0 ? (
            <div className="info-detail__empty">暂无观点，来添加第一个观点吧</div>
          ) : (
            <List>
              {viewpoints.map(vp => {
                const vpTags = parseTags(vp.tags);
                const vpStatus = vp.status || 'ACTIVE';
                const statusConfig = VP_STATUS_CONFIG[vpStatus] || VP_STATUS_CONFIG.ACTIVE;
                
                return (
                  <SwipeAction
                    key={vp.id}
                    rightActions={getVpSwipeActions(vp)}
                  >
                    <List.Item className="vp-item">
                      <div className="vp-item__header">
                        <div className="vp-item__status-tags">
                          <span 
                            className="vp-item__status-badge"
                            style={{ 
                              color: statusConfig.color, 
                              background: statusConfig.bg,
                              borderColor: statusConfig.color 
                            }}
                          >
                            {statusConfig.label}
                          </span>
                          {vpTags.map((tag, i) => (
                            <span 
                              key={i} 
                              className="vp-item__tag-pill"
                              style={{ 
                                color: getTagColor(tag),
                                background: `${getTagColor(tag)}18`,
                                borderColor: `${getTagColor(tag)}40`
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="vp-item__version">
                          v{vp.version || 1}
                        </span>
                      </div>
                      <div className="vp-item__content">{vp.content}</div>
                      <div className="vp-item__date">
                        {formatTimestamp(vp.created_at)}
                        {vp.updated_at && vp.updated_at !== vp.created_at && (
                          <span className="vp-item__edited"> · 编辑于 {formatTimestamp(vp.updated_at)}</span>
                        )}
                      </div>
                    </List.Item>
                  </SwipeAction>
                );
              })}
            </List>
          )}
        </div>

        {/* ── Add Viewpoint ── */}
        <div className="info-detail__add-vp">
          <TextArea
            placeholder="输入你的观点、分析或灵感..."
            value={newViewpoint}
            onChange={setNewViewpoint}
            autoSize={{ minRows: 3, maxRows: 6 }}
            className="vp-textarea"
          />
          
          <div className="info-detail__vp-tags-selector">
            <div className="info-detail__vp-tags-label">标签（可选）</div>
            <div className="info-detail__vp-tags-options">
              {VP_TAG_PRESETS.map(preset => (
                <span
                  key={preset.value}
                  className={`info-detail__vp-tag-chip ${newVpTags.includes(preset.value) ? 'active' : ''}`}
                  style={{
                    '--chip-color': preset.color,
                  }}
                  onClick={() => {
                    setNewVpTags(prev => 
                      prev.includes(preset.value)
                        ? prev.filter(t => t !== preset.value)
                        : [...prev, preset.value]
                    );
                  }}
                >
                  {preset.label}
                </span>
              ))}
            </div>
          </div>
          
          <Button 
            color="primary" 
            size="small" 
            onClick={handleAddViewpoint}
            loading={submittingVp}
            disabled={!newViewpoint.trim()}
          >
            添加观点
          </Button>
        </div>
      </div>

      <div className="info-detail__footer">
        <Button block color="primary" size="large" onClick={handleCreateDecision}>
          生成投资决策
        </Button>
      </div>
    </div>
  );
}
