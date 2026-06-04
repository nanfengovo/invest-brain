import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Button, Toast, Tag, TextArea, Divider, List, ActionSheet, SwipeAction, Modal } from 'antd-mobile';
import { LinkOutline, AppstoreOutline, MoreOutline } from 'antd-mobile-icons';
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

/**
 * Convert a Unix timestamp (seconds) to locale date string.
 */
function formatTimestamp(ts) {
  if (!ts) return '—';
  // created_at is stored as seconds (unixepoch), JS Date needs milliseconds
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

/**
 * Try to parse a YouTube video ID from a URL.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
 */
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

/**
 * Try to parse a Bilibili BV ID from a URL.
 * Supports: bilibili.com/video/BVxxxxxx
 */
function getBilibiliId(url) {
  if (!url) return null;
  try {
    const match = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
    return match ? match[1] : null;
  } catch { /* ignore */ }
  return null;
}

/**
 * Check if URL is from X/Twitter.
 */
function isTwitterUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com');
  } catch { return false; }
}

export default function InformationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewpoints, setViewpoints] = useState([]);
  const [fileUrl, setFileUrl] = useState(null);
  const [contentExpanded, setContentExpanded] = useState(false);
  
  const [newViewpoint, setNewViewpoint] = useState('');
  const [submittingVp, setSubmittingVp] = useState(false);
  
  const addViewpoint = useTradeStore(s => s.addViewpoint);

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
        
        // Fetch viewpoints
        const vps = await db.getViewpoints(id);
        setViewpoints(vps || []);

        // Load file from OPFS if available
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
      });
      if (res.success) {
        Toast.show({ icon: 'success', content: '添加成功' });
        setNewViewpoint('');
        // Reload viewpoints
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

  // Determine embed type
  const youtubeId = useMemo(() => info?.url ? getYouTubeId(info.url) : null, [info?.url]);
  const bilibiliId = useMemo(() => info?.url ? getBilibiliId(info.url) : null, [info?.url]);
  const isTwitter = useMemo(() => isTwitterUrl(info?.url), [info?.url]);

  // Content truncation
  const CONTENT_LIMIT = 300;
  const shouldTruncate = info?.content && info.content.length > CONTENT_LIMIT;
  const displayContent = shouldTruncate && !contentExpanded
    ? info.content.slice(0, CONTENT_LIMIT) + '...'
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
          <div className="info-detail__tags">
            <Tag color={TYPE_COLORS[info.type] || 'default'} fill="outline">
              {TYPE_LABELS[info.type] || info.type}
            </Tag>
            {info.asset_symbol && (
              <Tag color="primary" fill="outline">
                <AppstoreOutline style={{ marginRight: 4 }} />
                {info.asset_symbol}
              </Tag>
            )}
            {info.sector && (
              <Tag color="success" fill="outline">{info.sector}</Tag>
            )}
          </div>
          <div className="info-detail__date">
            创建于 {formatTimestamp(info.created_at)}
          </div>
        </div>

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

        {/* ── Content Body ── */}
        {info.content && (
          <div className="info-detail__body glass-card">
            <div className="info-detail__body-label">正文内容</div>
            <div className="info-detail__body-text">
              {displayContent}
            </div>
            {shouldTruncate && (
              <button
                className="info-detail__body-toggle"
                onClick={() => setContentExpanded(!contentExpanded)}
              >
                {contentExpanded ? '收起 ▲' : '展开全文 ▼'}
              </button>
            )}
          </div>
        )}

        <Divider>标注与观点</Divider>

        <div className="info-detail__viewpoints">
          {viewpoints.length === 0 ? (
            <div className="info-detail__empty">暂无观点，来添加第一个观点吧</div>
          ) : (
            <List>
              {viewpoints.map(vp => (
                <SwipeAction
                  key={vp.id}
                  rightActions={[
                    {
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
                    },
                  ]}
                >
                  <List.Item className="vp-item">
                    <div className="vp-item__content">{vp.content}</div>
                    <div className="vp-item__date">
                      {formatTimestamp(vp.created_at)}
                    </div>
                  </List.Item>
                </SwipeAction>
              ))}
            </List>
          )}
        </div>

        <div className="info-detail__add-vp">
          <TextArea
            placeholder="输入你的观点、分析或灵感..."
            value={newViewpoint}
            onChange={setNewViewpoint}
            autoSize={{ minRows: 3, maxRows: 6 }}
            className="vp-textarea"
          />
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
