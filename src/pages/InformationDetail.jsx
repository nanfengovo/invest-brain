import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Button, Toast, Tag, TextArea, Divider, List, ActionSheet, SwipeAction, Modal, Popup, Selector, Input } from 'antd-mobile';
import { LinkOutline, MoreOutline, EditSOutline, AddOutline, PlayOutline, EyeOutline, DeleteOutline } from 'antd-mobile-icons';
import { db } from '../db/database';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { getFileUrlFromOPFS } from '../utils/opfsUtils';
import { findMediaUrls } from '../utils/mediaResolver';
import { resolveInformationReaderKind } from '../utils/informationReaderKind';
import { detectVideoPlatform } from '../utils/videoPlatforms';
import { getSyncStatusMeta, isTeamMirrorRecord } from '../utils/syncStatus';
import { sharePoster } from '../utils/sharePoster';
import { compactAiUsageLabel, getAiUsageLabel, getModelDisplayName } from '../utils/aiProviders';
import {
  getCachedInformationTranslation,
  saveInformationTranslation,
  shouldAutoTranslateText,
  translateTextToChineseInChunks,
  translateTextToChinese,
} from '../utils/informationAutoTranslation';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AssetLogo from '../components/common/AssetLogo';
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

const SectorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="1em" height="1em">
    <path d="M4 5h7v7H4z" />
    <path d="M13 5h7v7h-7z" />
    <path d="M4 14h7v5H4z" />
    <path d="M13 14h7v5h-7z" />
  </svg>
);

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

const AUTO_TITLE_TRANSLATION_TIMEOUT_MS = 18000;
const AUTO_READER_TRANSLATION_CHUNK_TIMEOUT_MS = 45000;
const AUTO_READER_TRANSLATION_WATCHDOG_MS = 55000;

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

function isTwitterUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com');
  } catch { return false; }
}

function getTwitterPostId(url) {
  if (!isTwitterUrl(url)) return null;
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/status(?:es)?\/(\d+)/);
    return match ? match[1] : null;
  } catch { return null; }
}

function isDirectVideoUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|#|$)/i.test(url);
}

function isDirectImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}

function isPdfUrl(url = '') {
  return /\.pdf(\?|#|$)/i.test(url);
}

function isEpubUrl(url = '') {
  return /\.epub(\?|#|$)/i.test(url);
}

function getFileExtension(path = '') {
  const cleanPath = String(path || '').split(/[?#]/)[0];
  const match = cleanPath.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function looksLikeHtml(content = '') {
  return /<\/?(article|section|main|p|h[1-6]|div|table|figure|blockquote|ul|ol|img|a)\b/i.test(content);
}

function stripSourceScaffold(content = '') {
  const original = String(content || '');
  const normalized = original
    .replace(/^Title:\s*.*$/gim, '')
    .replace(/^Markdown Content:\s*/gim, '')
    .replace(/^视频嵌入:\s*\S+$/gim, '')
    .replace(/^视频地址:\s*\S+$/gim, '')
    .replace(/^封面地址:\s*\S+$/gim, '')
    .replace(/\s+URL Source:\s*https?:\/\/\S+(?:\s+Published Time:\s*[^\n]+)?/gim, '')
    .replace(/\s+Published Time:\s*[^\n]+/gim, '');

  const cleaned = normalized
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^URL Source:\s*https?:\/\//i.test(trimmed)) return false;
      if (/^Published Time:/i.test(trimmed)) return false;
      if (/^(Post|Conversation|查看 X 原文)$/i.test(trimmed)) return false;
      if (/^#+\s*(Post|Conversation)\s*$/i.test(trimmed)) return false;
      if (/\s\/\s*X$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const meaningfulContent = cleaned.replace(/^作者:\s*.*$/gim, '').trim();
  return meaningfulContent ? cleaned : original.trim();
}

function cleanContentForTranslation(content = '') {
  return stripSourceScaffold(content)
    .replace(/^作者:\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getLabeledUrl(content = '', label) {
  const pattern = new RegExp(`^${label}:\\s*(https?:\\/\\/\\S+)`, 'im');
  return String(content || '').match(pattern)?.[1] || null;
}

function getReaderLabel(kind) {
  const labels = {
    pdf: 'PDF / 财报阅读',
    epub: 'EPUB 阅读',
    video: '视频材料',
    image: '图片 / 图表',
    html: 'HTML 正文',
    markdown: 'Markdown 正文',
    webpage: '网页来源',
    xpost: 'X / 推文',
  };
  return labels[kind] || '信息正文';
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTwitterFallbackText(content = '', title = '') {
  const text = String(content || '');
  const titleMatch = text.match(/Title:\s*[^"]*"([^"]+)"/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }

  const markerMatch = text.match(/Markdown Content:\s*([\s\S]*)/i);
  const source = markerMatch ? markerMatch[1] : text;
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(Post|Conversation|Markdown Content:|查看 X 原文)$/i.test(line))
    .filter((line) => !/^#+\s*/.test(line))
    .filter((line) => !/^\[[^\]]*\]\([^)]+\)$/.test(line));

  return lines.slice(0, 4).join('\n') || String(title || '').trim();
}

let twitterWidgetsPromise = null;

function loadTwitterWidgets() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Twitter widgets need a browser environment'));
  }

  if (window.twttr?.widgets?.load) {
    return Promise.resolve(window.twttr);
  }

  if (twitterWidgetsPromise) {
    return twitterWidgetsPromise;
  }

  twitterWidgetsPromise = new Promise((resolve, reject) => {
    const twttrStub = window.twttr || {};
    twttrStub._e = twttrStub._e || [];
    twttrStub.ready = twttrStub.ready || ((callback) => twttrStub._e.push(callback));
    window.twttr = twttrStub;

    const timeoutId = window.setTimeout(() => {
      reject(new Error('Twitter widgets initialization timed out'));
    }, 10000);

    const existingScript = document.getElementById('twitter-wjs');
    const resolveWhenReady = () => {
      if (window.twttr?.ready) {
        window.twttr.ready(() => {
          window.clearTimeout(timeoutId);
          if (window.twttr?.widgets?.load) {
            resolve(window.twttr);
          } else {
            reject(new Error('Twitter widgets unavailable'));
          }
        });
      } else if (window.twttr?.widgets?.load) {
        window.clearTimeout(timeoutId);
        resolve(window.twttr);
      } else {
        reject(new Error('Twitter widgets unavailable'));
      }
    };

    if (existingScript) {
      existingScript.addEventListener('load', resolveWhenReady, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Twitter widgets failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'twitter-wjs';
    script.type = 'text/javascript';
    script.async = true;
    script.defer = true;
    script.charset = 'utf-8';
    script.src = 'https://platform.twitter.com/widgets.js';
    script.onload = resolveWhenReady;
    script.onerror = () => reject(new Error('Twitter widgets failed to load'));
    document.body.appendChild(script);
  });

  return twitterWidgetsPromise;
}

function waitForTweetIframe(target, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (target?.querySelector('iframe')) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

function TwitterPostEmbed({ url, fallbackText }) {
  const targetRef = useRef(null);
  const [status, setStatus] = useState('enhancing');

  useEffect(() => {
    let cancelled = false;
    const target = targetRef.current;
    if (!target || !url) return undefined;

    setStatus('enhancing');

    loadTwitterWidgets()
      .then(async (twttr) => {
        twttr.widgets.load(target);
        return waitForTweetIframe(target);
      })
      .then((hasIframe) => {
        if (cancelled) return;
        setStatus(hasIframe ? 'ready' : 'fallback');
      })
      .catch(() => {
        if (!cancelled) setStatus('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="info-detail__tweet-embed">
      <div className="info-detail__tweet-header">
        <span>官方 X 嵌入</span>
        <a href={url} target="_blank" rel="noreferrer">打开 X</a>
      </div>
      <div className="info-detail__tweet-body">
        {status === 'enhancing' && (
          <div className="info-detail__tweet-loading">正在加载官方 X 组件...</div>
        )}
        <div
          ref={targetRef}
          className={`info-detail__tweet-target ${status === 'fallback' ? 'info-detail__tweet-target--hidden' : ''}`}
        >
          <blockquote
            className="twitter-tweet"
            data-theme="dark"
            data-dnt="true"
            data-align="center"
          >
            {fallbackText && (
              <p>
                {fallbackText.split('\n').map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            )}
            <a href={url}>查看 X 原文</a>
          </blockquote>
        </div>
        {status === 'fallback' && (
          <>
            {fallbackText && (
              <div className="info-detail__tweet-fallback">
                {fallbackText.split('\n').map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
            <div className="info-detail__tweet-note">
              已显示本地保存的 X 内容摘录。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HtmlDocumentReader({ html, title }) {
  const srcDoc = useMemo(() => {
    const baseStyles = `
      <style>
        :root { color-scheme: dark; }
        body {
          margin: 0;
          padding: 18px;
          background: #101826;
          color: #e5edf8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 15px;
          line-height: 1.72;
        }
        a { color: #8ea2ff; }
        img, video { max-width: 100%; height: auto; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; overflow-x: auto; display: block; }
        th, td { border: 1px solid rgba(148, 163, 184, 0.25); padding: 8px; }
        blockquote {
          margin: 14px 0;
          padding: 10px 12px;
          border-left: 3px solid #7377ff;
          background: rgba(115, 119, 255, 0.1);
          border-radius: 0 8px 8px 0;
        }
      </style>
    `;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || 'HTML 文档')}</title>${baseStyles}</head><body>${html}</body></html>`;
  }, [html, title]);

  return (
    <iframe
      title="HTML reader"
      className="info-detail__html-frame"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
    />
  );
}

function WebPageReader({ url, content, title }) {
  if (content) {
    return (
      <div className="info-detail__article-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="info-detail__web-reader">
      <iframe
        title={title || '网页来源'}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
      <div className="info-detail__web-reader-note">
        外部站点如果禁止嵌套，浏览器会拦截这一块。页面仍会保留来源跳转，同时建议保存正文摘录作为系统内阅读材料。
      </div>
    </div>
  );
}

function InformationReader({
  info,
  kind,
  sourceUrl,
  validUrl,
  videoEmbedUrl,
  resolvedVideoUrl,
  resolvedImageUrl,
  cleanContent,
  twitterFallbackText,
  pdfPageNumber,
  pdfNumPages,
  setPdfPageNumber,
  setPdfNumPages,
  readerContent,
}) {
  const title = info?.title || '信息正文';
  const content = readerContent ?? cleanContent;

  if (kind === 'pdf') {
    if (!sourceUrl) {
      return <div className="info-detail__reader-state">没有找到 PDF 文件。</div>;
    }
    if (sourceUrl.startsWith('blob:')) {
      return (
        <div className="info-detail__pdf-wrapper">
          <Document
            file={sourceUrl}
            onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
            loading={<div className="info-detail__pdf-loading">加载 PDF 中...</div>}
          >
            <Page
              pageNumber={pdfPageNumber}
              width={Math.min(window.innerWidth - 64, 680)}
              renderTextLayer
              renderAnnotationLayer
              className="info-detail__pdf-page"
            />
          </Document>
          {pdfNumPages && (
            <div className="info-detail__pdf-controls">
              <Button size="mini" disabled={pdfPageNumber <= 1} onClick={() => setPdfPageNumber(p => p - 1)}>
                上一页
              </Button>
              <span className="info-detail__pdf-page-info">{pdfPageNumber} / {pdfNumPages}</span>
              <Button size="mini" disabled={pdfPageNumber >= pdfNumPages} onClick={() => setPdfPageNumber(p => p + 1)}>
                下一页
              </Button>
            </div>
          )}
        </div>
      );
    }
    return (
      <iframe
        title="PDF reader"
        className="info-detail__pdf-frame"
        src={sourceUrl}
      />
    );
  }

  if (kind === 'epub') {
    return (
      <div className="info-detail__reader-state info-detail__reader-state--epub">
        <strong>已识别 EPUB 文件</strong>
        <span>当前前端不直接解析 EPUB，以避免引入不安全的 XML 解析依赖。可以先保存摘录或通过后端解析服务转成 HTML / Markdown 后在系统内阅读。</span>
      </div>
    );
  }

  if (kind === 'video') {
    if (videoEmbedUrl) {
      return (
        <div className="info-detail__embed-player">
          <iframe
            src={videoEmbedUrl}
            title={`${title} 播放器`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            scrolling="no"
          />
        </div>
      );
    }
    return (
      <video
        src={resolvedVideoUrl || sourceUrl}
        poster={resolvedImageUrl || undefined}
        controls
        playsInline
        className="info-detail__video"
      />
    );
  }

  if (kind === 'image') {
    return <img src={resolvedImageUrl || sourceUrl} alt={title} className="info-detail__image" />;
  }

  if (kind === 'xpost') {
    return <TwitterPostEmbed url={validUrl} fallbackText={twitterFallbackText} />;
  }

  if (kind === 'html') {
    return <HtmlDocumentReader html={content} title={title} />;
  }

  if (kind === 'markdown') {
    return (
      <div className="info-detail__article-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  if (kind === 'webpage') {
    return <WebPageReader url={validUrl} content={content} title={title} />;
  }

  return <div className="info-detail__reader-state">还没有正文、文件或可展示来源。</div>;
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
  const workspaceScope = useAppStore(s => s.workspaceScope);
  const addMarketWatchItem = useAppStore(s => s.addMarketWatchItem);
  const geminiApiKey = useAppStore(s => s.geminiApiKey);
  const nvidiaApiKey = useAppStore(s => s.nvidiaApiKey);
  const aiProviderConfig = useAppStore(s => s.aiProviderConfig);
  const [authorName, setAuthorName] = useState(
    syncUserId || localStorage.getItem('invest_sync_user_id') || '我'
  );
  const [submittingVp, setSubmittingVp] = useState(false);
  const [translationText, setTranslationText] = useState('');
  const [translationModel, setTranslationModel] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [autoTitleTranslation, setAutoTitleTranslation] = useState('');
  const [autoTranslationStatus, setAutoTranslationStatus] = useState('');
  const [autoTranslationModel, setAutoTranslationModel] = useState('');
  const [autoReaderTranslationStatus, setAutoReaderTranslationStatus] = useState('');
  const [autoReaderTranslationProgress, setAutoReaderTranslationProgress] = useState(null);
  const [readerMode, setReaderMode] = useState('original');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const autoTranslationRequestRef = useRef('');

  // Tag editing state
  const [editTypeVisible, setEditTypeVisible] = useState(false);
  const [editAssetVisible, setEditAssetVisible] = useState(false);
  const [editSectorVisible, setEditSectorVisible] = useState(false);
  const [editAssetValue, setEditAssetValue] = useState('');
  const [editSectorValue, setEditSectorValue] = useState('');
  const inlineSourceRef = useRef(null);

  const addViewpoint = useTradeStore(s => s.addViewpoint);
  const deleteInformation = useTradeStore(s => s.deleteInformation);
  const updateInformation = useTradeStore(s => s.updateInformation);
  const isTeamWorkspace = workspaceScope === 'team';
  const readOnly = isTeamWorkspace || isTeamMirrorRecord(info || {});

  const reloadContext = useCallback(async () => {
    const [vps, decisionsForInfo] = await Promise.all([
      db.getViewpoints(id, workspaceScope),
      db.getDecisionsByInformation(id, workspaceScope),
    ]);
    setViewpoints(vps || []);
    setLinkedDecisions(decisionsForInfo || []);
  }, [id, workspaceScope]);

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
  }, [id, navigate, reloadContext]);

  useEffect(() => {
    setTranslationText('');
    setTranslationModel('');
    setAutoTitleTranslation('');
    setAutoTranslationStatus('');
    setAutoTranslationModel('');
    setAutoReaderTranslationStatus('');
    setAutoReaderTranslationProgress(null);
    autoTranslationRequestRef.current = '';
    setReaderMode('original');
  }, [id]);

  const handleAddViewpoint = async () => {
    if (readOnly) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能添加观点' });
      return;
    }
    if (!newViewpoint.trim()) return;
    setSubmittingVp(true);
    try {
      const res = await addViewpoint({
        id: crypto.randomUUID(),
        info_id: id,
        content: newViewpoint.trim(),
        tags: newVpTags.length > 0 ? newVpTags : null,
        author: authorName.trim() || '我',
        source_author: authorName.trim() || syncUserId || '我',
        workspace_scope: 'personal',
        source_scope: 'personal',
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
    if (readOnly) {
      Toast.show({ content: '团队工作区是只读镜像，请复制到个人工作区后再新建决策' });
      return;
    }
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
    if (readOnly) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能编辑情报' });
      return;
    }
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
    if (readOnly) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能编辑情报' });
      return;
    }
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
    if (readOnly) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能编辑情报' });
      return;
    }
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
    if (readOnly) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能修改观点状态' });
      return;
    }
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

  const videoPlatform = useMemo(() => validUrl ? detectVideoPlatform(validUrl) : null, [validUrl]);
  const twitterPostId = useMemo(() => validUrl ? getTwitterPostId(validUrl) : null, [validUrl]);
  const isDirectVideo = useMemo(() => validUrl ? isDirectVideoUrl(validUrl) : false, [validUrl]);
  const isDirectImage = useMemo(() => validUrl ? isDirectImageUrl(validUrl) : false, [validUrl]);
  const isRemotePdf = useMemo(() => validUrl ? isPdfUrl(validUrl) : false, [validUrl]);
  const isRemoteEpub = useMemo(() => validUrl ? isEpubUrl(validUrl) : false, [validUrl]);
  const fileExtension = useMemo(() => getFileExtension(info?.file_path), [info?.file_path]);
  const isPdf = fileExtension === 'pdf';
  const isEpub = fileExtension === 'epub';
  const isVideoInfo = info?.type === 'VIDEO';
  const isImageInfo = info?.type === 'IMAGE';

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

  const labeledVideoEmbedUrl = useMemo(() => getLabeledUrl(displayContent, '视频嵌入'), [displayContent]);
  const cleanContent = useMemo(() => stripSourceScaffold(displayContent), [displayContent]);
  const isHtmlContent = useMemo(() => looksLikeHtml(cleanContent), [cleanContent]);
  const twitterFallbackText = useMemo(() => getTwitterFallbackText(displayContent, info?.title), [displayContent, info?.title]);
  const embeddedMedia = useMemo(() => findMediaUrls(info?.url, displayContent), [displayContent, info?.url]);
  const resolvedVideoUrl = getLabeledUrl(displayContent, '视频地址') || embeddedMedia.videos[0] || (isDirectVideo ? validUrl : null);
  const resolvedImageUrl = embeddedMedia.images[0] || (isDirectImage ? validUrl : null);
  const videoEmbedUrl = labeledVideoEmbedUrl || videoPlatform?.embedUrl || null;
  const readerKind = useMemo(() => {
    return resolveInformationReaderKind({
      infoType: info?.type,
      cleanContent,
      fileUrl,
      isPdf,
      isRemotePdf,
      isEpub,
      isRemoteEpub,
      isHtmlContent,
      isImageInfo,
      isVideoInfo,
      resolvedImageUrl,
      resolvedVideoUrl,
      videoEmbedUrl,
      twitterPostId,
      validUrl,
      videoPlatform,
    });
  }, [
    cleanContent,
    fileUrl,
    isEpub,
    isHtmlContent,
    isImageInfo,
    isVideoInfo,
    isPdf,
    isRemoteEpub,
    isRemotePdf,
    info?.type,
    resolvedImageUrl,
    resolvedVideoUrl,
    videoEmbedUrl,
    twitterPostId,
    validUrl,
    videoPlatform,
  ]);
  const readerSourceUrl = fileUrl || validUrl;
  const hasInlineSource = readerKind !== 'webpage' && readerKind !== 'empty';
  const canTranslateReader = ['markdown', 'html', 'webpage'].includes(readerKind) && Boolean(cleanContent);
  const translationSourceContent = cleanContentForTranslation(cleanContent);
  const isTranslatedMode = readerMode === 'translated' && Boolean(translationText);
  const activeReaderContent = isTranslatedMode ? translationText : cleanContent;
  const displayTitle = autoTitleTranslation || info?.title || '';
  const configuredTranslationModel = useMemo(() => {
    const modelName = getModelDisplayName(aiProviderConfig?.textModel);
    return modelName || (aiProviderConfig?.provider === 'gemini' ? 'Gemini' : 'NVIDIA');
  }, [aiProviderConfig?.provider, aiProviderConfig?.textModel]);
  const autoTranslationModelLabel = compactAiUsageLabel(autoTranslationModel || configuredTranslationModel);

  useEffect(() => {
    if (!info) return undefined;
    const needsTitleTranslation = shouldAutoTranslateText(info.title);
    const needsContentTranslation = canTranslateReader && shouldAutoTranslateText(translationSourceContent);
    if (!needsTitleTranslation && !needsContentTranslation) return undefined;

    const requestKey = [
      info.id,
      needsTitleTranslation ? info.title : '',
      needsContentTranslation ? translationSourceContent : '',
    ].join('|');
    if (autoTranslationRequestRef.current === requestKey) return undefined;
    autoTranslationRequestRef.current = requestKey;

    const cached = getCachedInformationTranslation(info, {
      title: info.title,
      content: translationSourceContent,
    });
    if (needsTitleTranslation && cached?.title) {
      setAutoTitleTranslation(cached.title);
      setAutoTranslationModel(cached.modelLabel || '');
    }
    if (needsContentTranslation && cached?.content) {
      setTranslationText(cached.content);
      setTranslationModel(cached.modelLabel || '');
      setReaderMode('translated');
    }
    if ((!needsTitleTranslation || cached?.title) && (!needsContentTranslation || cached?.content)) {
      setAutoTranslationStatus(cached?.title ? 'ready' : '');
      setAutoReaderTranslationStatus(cached?.content ? 'ready' : '');
      setAutoReaderTranslationProgress(null);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    let readerWatchdogId = null;
    let readerWatchdogTimedOut = false;
    const clearReaderWatchdog = () => {
      if (readerWatchdogId) {
        window.clearTimeout(readerWatchdogId);
        readerWatchdogId = null;
      }
    };
    const armReaderWatchdog = () => {
      clearReaderWatchdog();
      readerWatchdogTimedOut = false;
      readerWatchdogId = window.setTimeout(() => {
        if (cancelled) return;
        readerWatchdogTimedOut = true;
        setAutoReaderTranslationStatus('failed');
        setAutoReaderTranslationProgress(null);
        controller.abort();
      }, AUTO_READER_TRANSLATION_WATCHDOG_MS);
    };
    setAutoTranslationStatus(needsTitleTranslation && !cached?.title ? 'translating' : (cached?.title ? 'ready' : ''));
    setAutoTranslationModel(cached?.modelLabel || '');
    setAutoReaderTranslationStatus(needsContentTranslation && !cached?.content ? 'translating' : (cached?.content ? 'ready' : ''));
    setAutoReaderTranslationProgress(needsContentTranslation && !cached?.content ? { completed: 0, total: 0 } : null);

    const run = async () => {
      let translatedTitle = cached?.title || '';
      let translatedContent = cached?.content || '';
      let modelLabel = cached?.modelLabel || '';

      try {
        if (needsTitleTranslation && !translatedTitle) {
          const titleResult = await translateTextToChinese({
            text: info.title,
            title: info.title,
            geminiApiKey,
            nvidiaApiKey,
            aiProviderConfig,
            signal: controller.signal,
            timeoutMs: AUTO_TITLE_TRANSLATION_TIMEOUT_MS,
          });
          translatedTitle = titleResult.translatedText;
          modelLabel = titleResult.modelLabel || modelLabel;
          if (!cancelled && translatedTitle) {
            setAutoTitleTranslation(translatedTitle);
            setAutoTranslationModel(modelLabel);
            saveInformationTranslation(info, {
              title: info.title,
              content: translationSourceContent,
              translatedTitle,
              modelLabel,
            });
            setAutoTranslationStatus('ready');
          }
        }
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setAutoTranslationStatus('failed');
      }

      try {
        if (needsContentTranslation && !translatedContent) {
          armReaderWatchdog();
          const contentResult = await translateTextToChineseInChunks({
            text: translationSourceContent,
            title: translatedTitle || info.title,
            geminiApiKey,
            nvidiaApiKey,
            aiProviderConfig,
            signal: controller.signal,
            chunkTimeoutMs: AUTO_READER_TRANSLATION_CHUNK_TIMEOUT_MS,
            onProgress: (progress) => {
              if (!cancelled) {
                setAutoReaderTranslationProgress(progress);
                if (progress.completed > 0) armReaderWatchdog();
              }
            },
          });
          clearReaderWatchdog();
          translatedContent = contentResult.translatedText;
          modelLabel = contentResult.modelLabel || modelLabel;
          if (!cancelled && translatedContent) {
            setTranslationText(translatedContent);
            setTranslationModel(modelLabel);
            setReaderMode('translated');
            setAutoReaderTranslationStatus('ready');
            setAutoReaderTranslationProgress(null);
          }
        }

        if (!cancelled) {
          saveInformationTranslation(info, {
            title: info.title,
            content: translationSourceContent,
            translatedTitle,
            translatedContent,
            modelLabel,
          });
          setAutoTranslationStatus(translatedTitle || translatedContent ? 'ready' : '');
          setAutoReaderTranslationStatus(translatedContent ? 'ready' : '');
          setAutoReaderTranslationProgress(null);
        }
      } catch {
        clearReaderWatchdog();
        if (cancelled) return;
        if (controller.signal.aborted && !readerWatchdogTimedOut) return;
        setAutoTranslationStatus(translatedTitle ? 'ready' : 'failed');
        setAutoReaderTranslationStatus('failed');
        setAutoReaderTranslationProgress(null);
      }
    };

    run();
    return () => {
      cancelled = true;
      clearReaderWatchdog();
      controller.abort();
      if (autoTranslationRequestRef.current === requestKey) {
        autoTranslationRequestRef.current = '';
      }
    };
  }, [
    aiProviderConfig,
    configuredTranslationModel,
    canTranslateReader,
    geminiApiKey,
    info,
    nvidiaApiKey,
    translationSourceContent,
  ]);

  const handleTranslateReader = async (force = false) => {
    if (!canTranslateReader) {
      Toast.show({ content: '当前材料没有可翻译的正文' });
      return;
    }

    if (!translationSourceContent) {
      Toast.show({ content: '当前材料清洗后没有可翻译正文' });
      return;
    }

    if (translationText && !force) {
      setReaderMode('translated');
      return;
    }

    const estimatedChunkCount = Math.max(1, Math.ceil(translationSourceContent.length / 2800));
    setTranslationLoading(true);
    setAutoReaderTranslationStatus('translating');
    setAutoReaderTranslationProgress({ completed: 0, total: estimatedChunkCount });
    let toast = Toast.show({
      icon: 'loading',
      content: estimatedChunkCount > 1 ? '正在分段翻译中文...' : '正在翻译成中文...',
      duration: 0,
    });

    try {
      let lastProgressText = '';
      const result = await translateTextToChineseInChunks({
        text: translationSourceContent,
        title: autoTitleTranslation || info?.title || '',
        geminiApiKey,
        nvidiaApiKey,
        aiProviderConfig,
        chunkTimeoutMs: 45000,
        onProgress: ({ completed, total }) => {
          setAutoReaderTranslationProgress({ completed, total });
          if (total <= 1) return;
          const nextProgressText = `正在分段翻译中文... ${completed}/${total}`;
          if (nextProgressText === lastProgressText) return;
          lastProgressText = nextProgressText;
          toast.close();
          toast = Toast.show({ icon: 'loading', content: nextProgressText, duration: 0 });
        },
      });

      const nextTranslationText = String(result.translatedText || '').trim();
      if (!nextTranslationText) {
        throw new Error('模型没有返回翻译正文，请稍后重试');
      }

      toast.close();
      setTranslationText(nextTranslationText);
      const modelLabel = result.modelLabel || getAiUsageLabel(result);
      setTranslationModel(modelLabel || result.model || '');
      setAutoTranslationModel(modelLabel || '');
      setAutoReaderTranslationStatus('ready');
      setAutoReaderTranslationProgress(null);
      setReaderMode('translated');
      saveInformationTranslation(info, {
        title: info?.title || '',
        content: translationSourceContent,
        translatedTitle: autoTitleTranslation,
        translatedContent: nextTranslationText,
        modelLabel,
      });
      const chunkCount = Number(result.chunkCount || result.chunk_count || 1);
      const translatedChunks = Number(result.translatedChunks || result.translated_chunks || chunkCount);
      const completionText = chunkCount > 1
        ? `分段翻译完成 · ${translatedChunks}/${chunkCount} 段`
        : '翻译完成';
      Toast.show({
        icon: 'success',
        content: `${completionText}${modelLabel ? ` · ${modelLabel}` : ''}`,
      });
    } catch (error) {
      toast.close();
      Toast.show({ icon: 'fail', content: error.message || '翻译失败' });
      setAutoReaderTranslationStatus('failed');
      setAutoReaderTranslationProgress(null);
    } finally {
      setTranslationLoading(false);
    }
  };

  const handleAction = async (action) => {
    setActionSheetVisible(false);
    if (action.key === 'copy-personal') {
      await handleCopyToPersonal();
      return;
    }
    if (action.key === 'toggle-team') {
      await handleToggleInfoTeamVisible();
      return;
    }
    if (readOnly && ['archive', 'delete'].includes(action.key)) {
      Toast.show({ icon: 'fail', content: '团队工作区是只读镜像，不能修改或删除情报' });
      return;
    }
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

  const openSource = () => {
    if (!validUrl) {
      Toast.show({ content: '没有可打开的来源链接' });
      return;
    }
    if (hasInlineSource && inlineSourceRef.current) {
      inlineSourceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.open(validUrl, '_blank', 'noopener,noreferrer');
  };

  const markCurrentMaterial = () => {
    if (readOnly) {
      Toast.show({ content: '团队工作区是只读镜像，不能添加观点引用' });
      return;
    }
    const label = getReaderLabel(readerKind);
    setSelectedQuote(`${label}: ${info.title || extractDomain(validUrl || '')}`.slice(0, 500));
    Toast.show({ icon: 'success', content: '已标注当前材料' });
  };

  const handleShareInformationPoster = async () => {
    try {
      const result = await sharePoster({
        typeLabel: TYPE_LABELS[info?.type] || '情报',
        title: info?.title || '情报材料',
        subtitle: validUrl ? extractDomain(validUrl) : '本地情报库',
        sectionTitle: '信息摘要',
        accent: '#8ea2ff',
        accent2: '#38bdf8',
        metrics: [
          { label: '类型', value: TYPE_LABELS[info?.type] || info?.type || '情报', hint: '信息分类' },
          { label: '观点', value: viewpoints.length, hint: '已沉淀观点' },
          { label: '决策', value: linkedDecisions.length, hint: '关联决策' },
          { label: '来源', value: validUrl ? '外部' : '本地', hint: validUrl ? extractDomain(validUrl) : '离线保存' },
        ],
        highlights: [
          ...splitList(info?.asset_symbols || info?.asset_symbol || info?.asset_id).slice(0, 2).map((asset) => `关联标的：${asset}`),
          ...splitList(info?.sectors || info?.sector).slice(0, 2).map((sector) => `关联板块：${sector}`),
          cleanContent ? cleanContent.replace(/\s+/g, ' ').slice(0, 140) : '暂无正文摘要',
        ],
        fileName: `investbrain-info-${info?.id || Date.now()}.png`,
      });
      Toast.show({ icon: 'success', content: result.mode === 'native' ? '分享图已发送' : '分享图已下载' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      Toast.show({ icon: 'fail', content: error.message || '分享图生成失败' });
    }
  };

  const handleToggleInfoTeamVisible = async () => {
    if (readOnly) {
      Toast.show({ content: '团队镜像不能直接发布或撤回，请回到个人工作区操作' });
      return;
    }
    const nextVisible = !(info.team_visible === 1 || info.team_visible === true);
    await db.setInformationTeamVisible(info.id, nextVisible);
    setInfo((prev) => ({ ...prev, team_visible: nextVisible ? 1 : 0, sync_status: 'local' }));
    Toast.show({ icon: 'success', content: nextVisible ? '已标记为可发布到团队' : '已撤回团队发布标记' });
  };

  const handleToggleViewpointTeamVisible = async (vp) => {
    if (readOnly) {
      Toast.show({ content: '团队镜像不能直接发布或撤回，请回到个人工作区操作' });
      return;
    }
    const nextVisible = !(vp.team_visible === 1 || vp.team_visible === true);
    await db.setViewpointTeamVisible(vp.id, nextVisible);
    await reloadContext();
    Toast.show({ icon: 'success', content: nextVisible ? '观点已标记为可发布到团队' : '观点已撤回团队发布标记' });
  };

  const handleCopyToPersonal = async () => {
    if (!info) return;
    try {
      const newInfoId = crypto.randomUUID();
      const currentAuthor = syncUserId || localStorage.getItem('invest_sync_user_id') || '未标记';
      await db.addInformation({
        ...info,
        id: newInfoId,
        author: currentAuthor,
        source_author: currentAuthor,
        workspace_scope: 'personal',
        source_scope: 'personal',
        origin_id: newInfoId,
        sync_status: 'local',
        team_visible: 0,
        asset_ids: info.asset_symbols || info.asset_id,
        sectors: info.sectors || info.sector,
      });
      for (const vp of viewpoints) {
        const newViewpointId = crypto.randomUUID();
        await db.addViewpoint({
          ...vp,
          id: newViewpointId,
          info_id: newInfoId,
          author: currentAuthor,
          source_author: currentAuthor,
          workspace_scope: 'personal',
          source_scope: 'personal',
          origin_id: newViewpointId,
          sync_status: 'local',
          team_visible: 0,
        });
      }
      Toast.show({ icon: 'success', content: '已复制到个人工作区' });
      navigate(`/information/${newInfoId}`);
    } catch (err) {
      Toast.show({ icon: 'fail', content: err.message || '复制到个人工作区失败' });
    }
  };

  const actionSheetActions = readOnly
    ? [{ text: '复制到个人工作区', key: 'copy-personal' }]
    : [
      { text: info?.team_visible ? '撤回团队发布标记' : '发布到团队', key: 'toggle-team' },
      { text: '归档', key: 'archive' },
      { text: '删除', key: 'delete', danger: true },
    ];

  // Build swipe actions for viewpoint based on its current status
  const getVpSwipeActions = (vp) => {
    if (readOnly) return [];
    const status = vp.status || 'ACTIVE';
    const actions = [];
    actions.push({
      key: 'publish',
      text: vp.team_visible ? '撤回' : '发布',
      color: '#10b981',
      onClick: () => handleToggleViewpointTeamVisible(vp),
    });

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
  const infoSyncMeta = getSyncStatusMeta(info);

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
          <h1 className="info-detail__title">
            {displayTitle}
            {autoTranslationStatus === 'translating' && (
              <span className="info-detail__translation-state" title={autoTranslationModelLabel}>
                自动翻译中{autoTranslationModelLabel ? ` · ${autoTranslationModelLabel}` : ''}
              </span>
            )}
            {autoTranslationStatus === 'ready' && (
              <span className="info-detail__translation-state info-detail__translation-state--ready" title={autoTranslationModelLabel}>
                中文{autoTranslationModelLabel ? ` · ${autoTranslationModelLabel}` : ''}
              </span>
            )}
          </h1>
          <div className="info-detail__sync-row">
            <span className={`info-detail__sync-badge ${infoSyncMeta.className}`}>{infoSyncMeta.label}</span>
            {readOnly && <span className="info-detail__readonly-badge">团队镜像只读</span>}
          </div>

          {/* ── Editable Tags ── */}
          <div className="info-detail__tags">
            <Tag
              color={TYPE_COLORS[info.type] || 'default'}
              fill="outline"
              className={readOnly ? 'info-detail__tag-static' : 'info-detail__tag-editable'}
              onClick={() => !readOnly && setEditTypeVisible(true)}
            >
              {TYPE_LABELS[info.type] || info.type}
              {!readOnly && <EditSOutline className="info-detail__tag-edit-icon" />}
            </Tag>

            {infoAssets.length > 0 ? (
              infoAssets.map((asset) => (
                <Tag
                  key={asset}
                  color="primary"
                  fill="outline"
                  className={readOnly ? 'info-detail__tag-static' : 'info-detail__tag-editable'}
                  onClick={() => {
                    if (readOnly) return;
                    setEditAssetValue(infoAssets.join(','));
                    setEditAssetVisible(true);
                  }}
                >
                  <AssetLogo symbol={asset} className="info-detail__asset-logo" />
                  {asset}
                  {!readOnly && <EditSOutline className="info-detail__tag-edit-icon" />}
                </Tag>
              ))
            ) : (
              !readOnly && <Tag
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
                  className={readOnly ? 'info-detail__tag-static' : 'info-detail__tag-editable'}
                  onClick={() => {
                    if (readOnly) return;
                    setEditSectorValue(infoSectors.join(','));
                    setEditSectorVisible(true);
                  }}
                >
                  <SectorIcon />
                  {sector}
                  {!readOnly && <EditSOutline className="info-detail__tag-edit-icon" />}
                </Tag>
              ))
            ) : (
              !readOnly && <Tag
                color="default"
                fill="outline"
                className="info-detail__tag-add"
                onClick={() => {
                  setEditSectorValue('');
                  setEditSectorVisible(true);
                }}
              >
                <SectorIcon />
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

          <div className="info-detail__primary-actions">
            {validUrl && (
              <Button
                size="small"
                color="primary"
                className="info-detail__primary-action"
                onClick={openSource}
              >
                <span className="info-detail__primary-action-inner">
                  {isVideoInfo ? <PlayOutline /> : <EyeOutline />}
                  <span>{isVideoInfo ? '打开播放' : '打开阅读'}</span>
                </span>
              </Button>
            )}
            <Button
              size="small"
              fill="outline"
              color="danger"
              className="info-detail__primary-action"
              onClick={() => readOnly ? handleCopyToPersonal() : handleAction({ key: 'delete' })}
            >
              <span className="info-detail__primary-action-inner">
                {readOnly ? <AddOutline /> : <DeleteOutline />}
                <span>{readOnly ? '复制到个人' : '删除'}</span>
              </span>
            </Button>
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

        <section ref={inlineSourceRef} className="info-detail__reader glass-card">
          <div className="info-detail__reader-header">
            <div className="info-detail__reader-heading">
              <span>
                {getReaderLabel(readerKind)}
                {isTranslatedMode ? ' · 中文翻译' : ''}
              </span>
              {validUrl && <small>{extractDomain(validUrl)}</small>}
              {isTranslatedMode && translationModel && <small>翻译模型 {translationModel}</small>}
              {autoReaderTranslationStatus === 'translating' && (
                <small className="info-detail__reader-translation-status">
                  自动翻译正文
                  {autoReaderTranslationProgress?.total
                    ? ` ${autoReaderTranslationProgress.completed}/${autoReaderTranslationProgress.total}`
                    : ''}
                </small>
              )}
              {autoReaderTranslationStatus === 'failed' && !isTranslatedMode && (
                <small className="info-detail__reader-translation-status info-detail__reader-translation-status--failed">
                  自动翻译失败，可手动重试
                </small>
              )}
            </div>
            <div className="info-detail__reader-actions">
              {isTranslatedMode && <span className="info-detail__reader-mode-badge">中文</span>}
              {canTranslateReader && (
                isTranslatedMode ? (
                  <>
                    <Button size="mini" fill="outline" className="info-detail__reader-action info-detail__reader-action--muted" onClick={() => setReaderMode('original')}>原文</Button>
                    <Button size="mini" fill="outline" className="info-detail__reader-action info-detail__reader-action--translate" disabled={translationLoading} onClick={() => handleTranslateReader(true)}>
                      {translationLoading ? '翻译中' : '重译'}
                    </Button>
                  </>
                ) : (
                  <Button size="mini" fill="outline" className="info-detail__reader-action info-detail__reader-action--translate" disabled={translationLoading} onClick={() => handleTranslateReader(false)}>
                    {translationLoading ? '翻译中' : '翻译中文'}
                  </Button>
                )
              )}
              <Button size="mini" fill="outline" className="info-detail__reader-action info-detail__reader-action--utility" onClick={handleShareInformationPoster}>分享图</Button>
              <Button size="mini" fill="outline" className="info-detail__reader-action info-detail__reader-action--utility" onClick={markCurrentMaterial}>标注材料</Button>
              {validUrl && (
                <Button size="mini" color="primary" className="info-detail__reader-action info-detail__reader-action--source" onClick={() => window.open(validUrl, '_blank', 'noopener,noreferrer')}>
                  来源
                </Button>
              )}
            </div>
          </div>
          <InformationReader
            info={info}
            kind={readerKind}
            sourceUrl={readerSourceUrl}
            validUrl={validUrl}
            videoEmbedUrl={videoEmbedUrl}
            resolvedVideoUrl={resolvedVideoUrl}
            resolvedImageUrl={resolvedImageUrl}
            cleanContent={cleanContent}
            readerContent={activeReaderContent}
            twitterFallbackText={twitterFallbackText}
            pdfPageNumber={pdfPageNumber}
            pdfNumPages={pdfNumPages}
            setPdfPageNumber={setPdfPageNumber}
            setPdfNumPages={setPdfNumPages}
          />
        </section>

        <div className="info-detail__linked-decisions glass-card">
          <div className="info-detail__linked-header">
            <div>
              <div className="info-detail__linked-title">关联决策</div>
              <div className="info-detail__linked-subtitle">这条信息可以沉淀出多个投资决策</div>
            </div>
            {!readOnly && <Button size="mini" color="primary" onClick={handleCreateDecision}>新建</Button>}
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
            <div className="info-detail__linked-empty">
              {readOnly ? '暂无团队发布的关联决策。' : '暂无决策，从这条信息生成后会自动绑定来源。'}
            </div>
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
                const vpSyncMeta = getSyncStatusMeta(vp);

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
                          <span className={`vp-item__sync-badge ${vpSyncMeta.className}`}>
                            {vpSyncMeta.label}
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
        {!readOnly && <div className="info-detail__add-vp">
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
        </div>}
      </div>

      {!readOnly && (
        <div className="info-detail__footer">
          <Button block color="primary" size="large" onClick={handleCreateDecision}>
            生成投资决策
          </Button>
        </div>
      )}
    </div>
  );
}
