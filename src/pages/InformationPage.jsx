import { useState, useEffect, useMemo } from 'react';
import { Tabs, FloatingBubble, Popup, Card, Tag } from 'antd-mobile';
import { AddOutline, LinkOutline, PictureOutline, VideoOutline, FileOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '../stores/useTradeStore';
import InformationForm from '../components/Information/InformationForm';
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

export default function InformationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ALL');
  const [viewMode, setViewMode] = useState('INBOX'); // 'INBOX' or 'ARCHIVED'
  const [showAdd, setShowAdd] = useState(false);
  
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

  const filteredInfo = activeTab === 'ALL' 
    ? informations 
    : informations.filter(i => i.type === activeTab);

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
          <div className="info-page__empty">暂无相关情报</div>
        ) : (
          filteredInfo.map(info => (
            <Card 
              key={info.id} 
              className="info-card"
              onClick={() => navigate(`/information/${info.id}`)}
            >
              <div className="info-card__header">
                <div className="info-card__title">{info.title}</div>
                <Tag color={TYPE_COLORS[info.type] || 'default'} fill="outline">
                  {TYPE_LABELS[info.type] || info.type}
                </Tag>
              </div>
              {info.content && (
                <div className="info-card__preview">
                  {info.content.length > 60 ? info.content.substring(0, 60) + '…' : info.content}
                </div>
              )}
              <div className="info-card__footer">
                <div className="info-card__type">
                  {TYPE_ICONS[info.type] || <LinkOutline />}
                </div>
                <div className="info-card__meta">
                  <span>观点: {info.viewpoint_count || 0}</span>
                  {info.asset_id && <span>关联: {info.asset_id}</span>}
                  <span className="info-card__date">
                    {new Date(info.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Card>
          ))
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
