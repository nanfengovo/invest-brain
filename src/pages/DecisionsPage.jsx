import { useState, useEffect } from 'react';
import { Tabs, Popup } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import DecisionForm from '../components/Decision/DecisionForm';
import DecisionCard from '../components/Decision/DecisionCard';
import EmptyState from '../components/common/EmptyState';
import './DecisionsPage.css';

const FILTER_TABS = [
  { key: 'ALL', title: '全部' },
  { key: 'ACTIVE', title: '活跃' },
  { key: 'VERIFIED', title: '已验证' },
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
    ACTIVE: { title: '没有活跃的决策', subtitle: '活跃决策会显示在这里' },
    VERIFIED: { title: '没有已验证的决策', subtitle: '验证后的决策会显示在这里' },
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
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🧠"
          title={emptyMessages[activeFilter].title}
          subtitle={emptyMessages[activeFilter].subtitle}
        />
      )}

      {/* ── FAB ── */}
      <button
        className="action-fab"
        onClick={() => {
          setEditingDecision(null);
          setShowForm(true);
        }}
        aria-label="新建决策"
      >
        +
      </button>

      {/* ── Decision Form Popup ── */}
      <Popup
        visible={showForm}
        onMaskClick={() => {
          setShowForm(false);
          setEditingDecision(null);
        }}
        position="bottom"
        bodyClassName="decisions-page__popup"
        destroyOnClose
      >
        <div className="decisions-page__popup-content">
          <div className="decisions-page__popup-handle" />
          <div className="decisions-page__popup-body">
            <DecisionForm 
              initialData={editingDecision}
              onSuccess={handleDecisionAdded} 
              onClose={() => {
                setShowForm(false);
                setEditingDecision(null);
              }}
            />
          </div>
        </div>
      </Popup>
    </div>
  );
}
