import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Button, Toast, Tag, TextArea, Divider, List } from 'antd-mobile';
import { LinkOutline, AppstoreOutline } from 'antd-mobile-icons';
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

export default function InformationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewpoints, setViewpoints] = useState([]);
  const [fileUrl, setFileUrl] = useState(null);
  
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

  if (loading) return <LoadingSpinner />;
  if (!info) return null;

  return (
    <div className="info-detail">
      <NavBar onBack={() => navigate(-1)}>情报详情</NavBar>
      
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
          {info.url && (
            <div className="info-detail__url">
              <LinkOutline /> 
              <a href={info.url} target="_blank" rel="noreferrer">
                {info.url}
              </a>
            </div>
          )}
          <div className="info-detail__date">
            创建于 {new Date(info.created_at).toLocaleString()}
          </div>
        </div>

        {fileUrl && (
          <div className="info-detail__media">
            {info.type === 'VIDEO' ? (
              <video src={fileUrl} controls className="info-detail__video" />
            ) : (
              <img src={fileUrl} alt="附件" className="info-detail__image" />
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
                <List.Item key={vp.id} className="vp-item">
                  <div className="vp-item__content">{vp.content}</div>
                  <div className="vp-item__date">
                    {new Date(vp.created_at).toLocaleString()}
                  </div>
                </List.Item>
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
