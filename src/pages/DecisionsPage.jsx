import { useState, useEffect } from 'react';
import { Tabs, Popup } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import DecisionForm from '../components/Decision/DecisionForm';
import DecisionCard from '../components/Decision/DecisionCard';
import EmptyState from '../components/common/EmptyState';
import './DecisionsPage.css';

const FILTER_TABS = [
  { key: 'ALL', title: '全部' },
  { key: 'DRAFT', title: '观点' },
  { key: 'WATCH', title: '观望' },
  { key: 'ACTIVE', title: '持仓中' },
  { key: 'CLOSED', title: '已完结' },
  { key: 'ABANDONED', title: '已放弃' },
];

export default function DecisionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const { decisions, decisionsLoading, refreshDecisions } = useTradeStore();

  useEffect(() => {
    refreshDecisions();
  }, [refreshDecisions]);

  const filteredDecisions =
    activeFilter === 'ALL'
      ? decisions
      : decisions.filter((d) => d.status === activeFilter);

  const handleDecisionAdded = () => {
    setShowForm(false);
    setEditingDecision(null);
    refreshDecisions();
  };

  const handleEdit = (decision) => {
    setEditingDecision(decision);
    setShowForm(true);
  };

  const emptyMessages = {
    ALL: { title: '还没有投资决策', subtitle: '记录你的投资逻辑和判断' },
    DRAFT: { title: '没有观点草稿', subtitle: '看完财报、会议所作的初步投资观点会在这里显示' },
    WATCH: { title: '没有观望中的计划', subtitle: '等待回调或特定事件触发的决策计划会显示在这里' },
    ACTIVE: { title: '没有执行持仓中的决策', subtitle: '目前正在持仓、执行过程中的决策会显示在这里' },
    CLOSED: { title: '没有已完结的决策', subtitle: '已结束并完成复盘归档的交易决策会显示在这里' },
    ABANDONED: { title: '没有已放弃的决策', subtitle: '逻辑破产或主动放弃追踪的计划会显示在这里' },
  };

  return (
    <div className="decisions-page">
      {/* ── Header ── */}
      <div className="decisions-page__header">
        <h1 className="decisions-page__title">投资决策</h1>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="decisions-page__tabs">
        <Tabs
          activeKey={activeFilter}
          onChange={setActiveFilter}
          style={{
            '--title-font-size': '14px',
          }}
        >
          {FILTER_TABS.map((tab) => (
            <Tabs.Tab key={tab.key} title={tab.title} />
          ))}
        </Tabs>
      </div>

      {/* ── Decision List ── */}
      {decisionsLoading && decisions.length === 0 ? (
        <div className="decisions-page__loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton--card" />
          ))}
        </div>
      ) : filteredDecisions.length > 0 ? (
        <div className="decisions-page__list">
          {filteredDecisions.map((decision) => (
            <DecisionCard 
              key={decision.id} 
              decision={decision} 
              onEdit={() => handleEdit(decision)} 
              onRefresh={refreshDecisions}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🧠"
          title={emptyMessages[activeFilter]?.title || '暂无内容'}
          subtitle={emptyMessages[activeFilter]?.subtitle || ''}
        />
      )}

      {/* ── FAB ── */}
      <button
        className="action-fab"
        onClick={() => {
          setEditingDecision(null);
          setShowForm(true);
        }}
      >
        <span>+</span>
      </button>

      {/* ── Add/Edit Popup ── */}
      <Popup
        visible={showForm}
        onMaskClick={() => {
          setShowForm(false);
          setEditingDecision(null);
        }}
        position="bottom"
        bodyStyle={{ height: '90vh' }}
      >
        <DecisionForm
          onClose={() => {
            setShowForm(false);
            setEditingDecision(null);
          }}
          onSuccess={handleDecisionAdded}
          initialData={editingDecision}
        />
      </Popup>
    </div>
  );
}
