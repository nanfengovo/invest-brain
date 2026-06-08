import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Popup, Button } from 'antd-mobile';
import { useTradeStore } from '../stores/useTradeStore';
import { useAppStore } from '../stores/useAppStore';
import { db } from '../db/database';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState(null);
  const [sourceInformation, setSourceInformation] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const { decisions, decisionsLoading, refreshDecisions } = useTradeStore();
  const workspaceScope = useAppStore((s) => s.workspaceScope);
  const isTeamWorkspace = workspaceScope === 'team';

  useEffect(() => {
    refreshDecisions();
  }, [refreshDecisions]);

  useEffect(() => {
    const shouldOpen = searchParams.get('new') === '1';
    const infoId = searchParams.get('info_id');
    if (!shouldOpen) return;
    if (isTeamWorkspace) {
      setSearchParams({}, { replace: true });
      return;
    }

    let mounted = true;
    async function openFromRoute() {
      setEditingDecision(null);
      if (infoId) {
        try {
          const info = await db.getInformationById(infoId);
          if (mounted) setSourceInformation(info);
        } catch (err) {
          console.warn('Failed to load source information for decision:', err);
          if (mounted) setSourceInformation(null);
        }
      } else {
        setSourceInformation(null);
      }
      if (mounted) setShowForm(true);
    }
    openFromRoute();

    return () => {
      mounted = false;
    };
  }, [searchParams, isTeamWorkspace, setSearchParams]);

  const filteredDecisions =
    activeFilter === 'ALL'
      ? decisions
      : decisions.filter((d) => d.status === activeFilter);

  const handleDecisionAdded = () => {
    closeForm();
    refreshDecisions();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingDecision(null);
    setSourceInformation(null);
    if (searchParams.toString()) {
      setSearchParams({}, { replace: true });
    }
  };

  const openCreateForm = () => {
    if (isTeamWorkspace) return;
    setEditingDecision(null);
    setSourceInformation(null);
    setShowForm(true);
  };

  const handleEdit = async (decision) => {
    if (isTeamWorkspace) return;
    try {
      const fullDecision = await db.getDecisionById(decision.id);
      setEditingDecision(fullDecision || decision);
      setSourceInformation(null);
      setShowForm(true);
    } catch {
      setEditingDecision(decision);
      setSourceInformation(null);
      setShowForm(true);
    }
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
        <div>
          <h1 className="decisions-page__title">投资决策</h1>
          <div className="decisions-page__subtitle">
            {isTeamWorkspace ? '团队镜像只读，用于查看所有成员发布的决策' : '把观点转成可执行、可复盘的交易计划'}
          </div>
        </div>
        {!isTeamWorkspace && (
          <Button size="small" color="primary" onClick={openCreateForm}>
            新建决策
          </Button>
        )}
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
              readOnly={isTeamWorkspace}
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
      {!isTeamWorkspace && (
        <button
          className="action-fab"
          onClick={openCreateForm}
        >
          <span>+</span>
        </button>
      )}

      {/* ── Add/Edit Popup ── */}
      <Popup
        visible={showForm}
        onMaskClick={closeForm}
        position="bottom"
        bodyStyle={{ height: '90vh' }}
      >
        <DecisionForm
          onClose={closeForm}
          onSuccess={handleDecisionAdded}
          initialData={editingDecision}
          sourceInformation={sourceInformation}
        />
      </Popup>
    </div>
  );
}
