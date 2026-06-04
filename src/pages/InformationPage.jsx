import { useState } from 'react';
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
  const [showAdd, setShowAdd] = useState(false);
  
  const informations = useTradeStore((s) => s.informations);

  const filteredInfo = activeTab === 'ALL' 
    ? informations 
    : informations.filter(i => i.type === activeTab);

  return (
    <div className="info-page">
      <div className="info-page__header">
        <h1>情报与资讯</h1>
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
