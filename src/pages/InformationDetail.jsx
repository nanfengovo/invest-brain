import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Button, Toast, Tag, TextArea, Divider, List, ActionSheet, SwipeAction, Modal, Popup, Selector, Input } from 'antd-mobile';
import { LinkOutline, AppstoreOutline, MoreOutline, EditSOutline, AddOutline } from 'antd-mobile-icons';
import { db } from '../db/database';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { getFileUrlFromOPFS } from '../utils/opfsUtils';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './InformationDetail.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

const splitList = (value) => String(value || '')
  .split(/[,\n，、]/)
  .map((item) => item.trim())
  .filter(Boolean);

const getStatusLabel = (status) => {
  const labels = {
    DRAFT: '观点',
    WATCH: '观望',
    ACTIVE: '执行中',
    CLOSED: '已闭环',
    ENDED: '已结束',
    ABANDONED: '已放弃',
  };
  return labels[status] || status || '未定义';
};

export default function InformationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewpoints, setViewpoints] = useState([]);
  const [linkedDecisions, setLinkedDecisions] = useState([]);
  const [fileUrl, setFileUrl] = useState(null);

  // PDF state
  const [pdfNumPages, setPdfNumPages] = useState(null);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);

  const [newViewpoint, setNewViewpoint] = useState('');
  const [newVpTags, setNewVpTags] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState('');
  const syncUserId = useAppStore(s => s.syncUserId);
  const addMarketWatchItem = useAppStore(s => s.addMarketWatchItem);
  const [authorName, setAuthorName] = useState(
    syncUserId || localStorage.getItem('invest_sync_user_id') || '我'
  );
  const [submittingVp, setSubmittingVp] = useState(false);

  // Tag editing state
  const [editTypeVisible, setEditTypeVisible] = useState(false);
  const [editAssetVisible, setEditAssetVisible] = useState(false);
  const [editSectorVisible, setEditSectorVisible] = useState(false);
  const [editAssetValue, setEditAssetValue] = useState('');
  const [editSectorValue, setEditSectorValue] = useState('');

  const addViewpoint = useTradeStore(s => s.addViewpoint);

  const reloadContext = async () => {
    const [vps, decisionsForInfo] = await Promise.all([
      db.getViewpoints(id),
      db.getDecisionsByInformation(id),
    ]);
    setViewpoints(vps || []);
    setLinkedDecisions(decisionsForInfo || []);
  };

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
        setEditAssetValue(infoData.asset_symbols || infoData.asset_symbol || infoData.asset_id || '');
        setEditSectorValue(infoData.sectors || infoData.sector || '');

        await reloadContext();

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
        author: authorName.trim() || '我',
        quote: selectedQuote.trim() || null,
        target_type: info?.type || 'GENERAL',
      });
      if (res.success) {
        Toast.show({ icon: 'success', content: '添加成功' });
        setNewViewpoint('');
        setNewVpTags([]);
        setSelectedQuote('');
        await reloadContext();
      } else {
        Toast.show({ icon: 'fail', content: '添加失败' });
      }
    } finally {
      setSubmittingVp(false);
    }
  };

  const handleCreateDecision = () => {
    navigate(`/decisions?info_id=${id}&new=1`);
  };

  const captureSelectedText = () => {
    const text = window.getSelection?.().toString().trim() || '';
    if (!text) {
      Toast.show({ content: '先在正文、PDF 文本层或页面里选中一段内容' });
      return;
    }
    setSelectedQuote(text.slice(0, 500));
    Toast.show({ icon: 'success', content: '已引用选中文本' });
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
    const assetIds = splitList(symbol).map((item) => item.toUpperCase());
    if (assetIds.length > 0) {
      try {
        for (const assetSymbol of assetIds) {
          await db.upsertAsset({ id: assetSymbol, symbol: assetSymbol, name: assetSymbol, type: 'STOCK' });
          addMarketWatchItem({
            symbol: assetSymbol,
            name: assetSymbol,
            quoteType: 'EQUITY',
            typeDisp: '股票',
          });
        }
        assetId = assetIds[0];
      } catch (err) {
        console.warn('Asset upsert failed:', err);
      }
    }

    const res = await updateInformation({ ...info, asset_id: assetId, asset_ids: assetIds });
    if (res.success) {
      setInfo(prev => ({
        ...prev,
        asset_id: assetId,
        asset_symbol: assetId,
        asset_symbols: assetIds.join(',') || null,
      }));
      Toast.show({ icon: 'success', content: assetIds.length ? '关联资产已更新' : '已取消关联' });
    }
    setEditAssetVisible(false);
  };

  const handleEditSector = async () => {
    const sector = editSectorValue.trim() || null;
    const sectors = splitList(editSectorValue);
    const updateInformation = useTradeStore.getState().updateInformation;
    const res = await updateInformation({ ...info, sector: sectors[0] || sector, sectors });
    if (res.success) {
      setInfo(prev => ({ ...prev, sector: sectors[0] || null, sectors: sectors.join(',') || null }));
      Toast.show({ icon: 'success', content: sectors.length ? '板块已更新' : '已清除板块' });
    }
    setEditSectorVisible(false);
  };

  const handleViewpointStatusChange = async (vpId, newStatus) => {
    const updateVpStatus = useTradeStore.getState().updateViewpointStatus;
    const res = await updateVpStatus(vpId, newStatus);
    if (res.success) {
      await reloadContext();
      Toast.show({ icon: 'success', content: `已标记为${VP_STATUS_CONFIG[newStatus]?.label || newStatus}` });
    }
  };

  // Determine embed type
  const realUrlMatch = info?.url?.match(/(https?:\/\/[^\s]+)/);
  const validUrl = realUrlMatch ? realUrlMatch[1] : null;

  const youtubeId = useMemo(() => validUrl ? getYouTubeId(validUrl) : null, [validUrl]);
  const bilibiliId = useMemo(() => validUrl ? getBilibiliId(validUrl) : null, [validUrl]);
  const isTwitter = useMemo(() => isTwitterUrl(validUrl), [validUrl]);
  const isPdf = useMemo(() => info?.file_path?.toLowerCase().endsWith('.pdf'), [info?.file_path]);

  // Content: show full by default, no collapse
  const displayContent = useMemo(() => {
    let text = info?.content || '';
    if (info?.url && info.url !== validUrl) {
      const extraText = info.url.replace(validUrl || '', '').trim();
      if (extraText && extraText !== info.url) {
        text = extraText + '\n\n' + text;
      } else if (!validUrl && info.url) {
        text = info.url + '\n\n' + text;
      }
    }
    return text.trim();
  }, [info?.content, info?.url, validUrl]);

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

  const infoAssets = splitList(info.asset_symbols || info.asset_symbol || info.asset_id);
  const infoSectors = splitList(info.sectors || info.sector);

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

            {infoAssets.length > 0 ? (
              infoAssets.map((asset) => (
                <Tag
                  key={asset}
                  color="primary"
                  fill="outline"
                  className="info-detail__tag-editable"
                  onClick={() => {
                    setEditAssetValue(infoAssets.join(','));
                    setEditAssetVisible(true);
                  }}
                >
                  <AppstoreOutline style={{ marginRight: 4 }} />
                  {asset}
                  <EditSOutline className="info-detail__tag-edit-icon" />
                </Tag>
              ))
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

            {infoSectors.length > 0 ? (
              infoSectors.map((sector) => (
                <Tag
                  key={sector}
                  color="success"
                  fill="outline"
                  className="info-detail__tag-editable"
                  onClick={() => {
                    setEditSectorValue(infoSectors.join(','));
                    setEditSectorVisible(true);
                  }}
                >
                  {sector}
                  <EditSOutline className="info-detail__tag-edit-icon" />
                </Tag>
              ))
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
            <div className="info-detail__edit-popup-title">关联资产代码（可多个）</div>
            <Input
              placeholder="用逗号分隔，如 AAPL,NVDA,MRVL"
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
            <div className="info-detail__edit-popup-title">关联模块/板块（可多个）</div>
            <Input
              placeholder="用逗号分隔，如 AI,半导体,电网"
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

        {/* ── Link Preview Card & Web Preview ── */}
        {validUrl && !youtubeId && !bilibiliId && (
          <>
            <div className="info-detail__link-card">
              <div className="info-detail__link-card-icon">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${extractDomain(validUrl)}&sz=32`}
                  alt=""
                  width="20"
                  height="20"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
              <div className="info-detail__link-card-body">
                <div className="info-detail__link-card-domain">{extractDomain(validUrl)}</div>
                <div className="info-detail__link-card-url">{validUrl}</div>
              </div>
              <a
                href={validUrl}
                target="_blank"
                rel="noreferrer"
                className="info-detail__link-card-btn"
              >
                {isTwitter ? '打开 𝕏' : '打开链接'}
              </a>
            </div>

            <div className="info-detail__web-preview">
              <iframe
                src={validUrl}
                title="Web Preview"
                className="info-detail__iframe"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                loading="lazy"
              />
            </div>
          </>
        )}

        {/* ── Uploaded Media (OPFS file) ── */}
        {fileUrl && (
          <div className="info-detail__media">
            {isPdf ? (
              <div className="info-detail__pdf-wrapper">
                <Document
                  file={fileUrl}
                  onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                  loading={<div className="info-detail__pdf-loading">加载 PDF 中...</div>}
                >
                  <Page
                    pageNumber={pdfPageNumber}
                    width={window.innerWidth - 32 - 32} // padding adjustments
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="info-detail__pdf-page"
                  />
                </Document>
                {pdfNumPages && (
                  <div className="info-detail__pdf-controls">
                    <Button
                      size="mini"
                      disabled={pdfPageNumber <= 1}
                      onClick={() => setPdfPageNumber(p => p - 1)}
                    >
                      上一页
                    </Button>
                    <span className="info-detail__pdf-page-info">
                      {pdfPageNumber} / {pdfNumPages}
                    </span>
                    <Button
                      size="mini"
                      disabled={pdfPageNumber >= pdfNumPages}
                      onClick={() => setPdfPageNumber(p => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </div>
            ) : info.type === 'VIDEO' ? (
              <video src={fileUrl} controls className="info-detail__video" />
            ) : (
              <img src={fileUrl} alt="附件" className="info-detail__image" />
            )}
          </div>
        )}

        {/* ── Content Body — Markdown Display ── */}
        {displayContent && (
          <div className="info-detail__body glass-card">
            <div className="info-detail__body-label">正文内容</div>
            <div className="info-detail__markdown-wrapper">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          </div>
        )}

        <div className="info-detail__linked-decisions glass-card">
          <div className="info-detail__linked-header">
            <div>
              <div className="info-detail__linked-title">关联决策</div>
              <div className="info-detail__linked-subtitle">这条信息可以沉淀出多个投资决策</div>
            </div>
            <Button size="mini" color="primary" onClick={handleCreateDecision}>新建</Button>
          </div>
          {linkedDecisions.length > 0 ? (
            <div className="info-detail__linked-list">
              {linkedDecisions.map((decision) => (
                <button
                  type="button"
                  key={decision.id}
                  className="info-detail__linked-item"
                  onClick={() => navigate('/decisions')}
                >
                  <span className="info-detail__linked-status">{getStatusLabel(decision.status)}</span>
                  <span className="info-detail__linked-name">{decision.title}</span>
                  <span className="info-detail__linked-meta">
                    {decision.asset_symbol || decision.asset_id || '未绑定标的'} · 重要度 {decision.priority || 3}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="info-detail__linked-empty">暂无决策，从这条信息生成后会自动绑定来源。</div>
          )}
        </div>

        <Divider>批注与评论</Divider>

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
                      <div className="vp-item__meta-line">
                        <span className="vp-item__author">{vp.author || '我'}</span>
                        <span>{formatTimestamp(vp.created_at)}</span>
                      </div>
                      {vp.quote && (
                        <blockquote className="vp-item__quote">{vp.quote}</blockquote>
                      )}
                      <div className="vp-item__content">{vp.content}</div>
                      <div className="vp-item__date">
                        {vp.updated_at && vp.updated_at !== vp.created_at && (
                          <span className="vp-item__edited">编辑于 {formatTimestamp(vp.updated_at)}</span>
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
          <div className="info-detail__comment-tools">
            <div className="info-detail__author-field">
              <span className="info-detail__author-label">花名</span>
              <Input
                value={authorName}
                onChange={setAuthorName}
                placeholder="我"
                clearable
                className="info-detail__author-input"
              />
            </div>
            <Button size="mini" fill="outline" onClick={captureSelectedText}>
              引用选中文本
            </Button>
          </div>

          {selectedQuote && (
            <div className="info-detail__selected-quote">
              <div className="info-detail__selected-quote-text">{selectedQuote}</div>
              <button
                type="button"
                className="info-detail__selected-quote-clear"
                onClick={() => setSelectedQuote('')}
              >
                移除引用
              </button>
            </div>
          )}

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
