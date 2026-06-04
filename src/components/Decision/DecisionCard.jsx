import { useCallback, useState } from 'react';
import { SwipeAction, Dialog, Toast, ActionSheet, Popup } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import ReviewForm from './ReviewForm';
import './DecisionCard.css';

const SENTIMENT_MAP = {
  BULLISH: { emoji: '🚀', className: 'bullish' },
  BEARISH: { emoji: '📉', className: 'bearish' },
  NEUTRAL: { emoji: '⚖️', className: 'neutral' },
};

const STATUS_LABELS = {
  DRAFT: { label: '观点草稿', className: 'draft' },
  WATCH: { label: '观望计划', className: 'watch' },
  ACTIVE: { label: '进行中/持仓', className: 'active' },
  CLOSED: { label: '已完结', className: 'closed' },
  ABANDONED: { label: '已放弃', className: 'abandoned' },
  // Keep active / closed compatibility
  ENDED: { label: '已结束', className: 'closed' },
};

/**
 * Render confidence stars (1–5).
 */
function ConfidenceStars({ value = 0 }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span
        key={i}
        className={
          i <= value
            ? 'decision-card__confidence-star'
            : 'decision-card__confidence-star decision-card__confidence-star--empty'
        }
      >
        ⭐
      </span>
    );
  }
  return <span className="decision-card__confidence">{stars}</span>;
}

/**
 * DecisionCard — displays a single investment decision/thesis.
 *
 * @param {object} props
 * @param {object} props.decision - Decision record object
 * @param {number} [props.index=0] - Index for stagger animation
 * @param {function} [props.onClick] - Tap handler
 * @param {function} [props.onEdit] - Edit handler
 * @param {function} [props.onRefresh] - Reload handler after state changes
 */
export default function DecisionCard({ decision, index = 0, onClick, onEdit, onRefresh }) {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const deleteDecision = useTradeStore((s) => s.deleteDecision);
  const updateDecision = useTradeStore((s) => s.updateDecision);

  const sentiment = SENTIMENT_MAP[decision.sentiment] || SENTIMENT_MAP.NEUTRAL;
  const status = STATUS_LABELS[decision.status] || STATUS_LABELS.ACTIVE;
  const animationDelay = `${index * 50}ms`;

  const handleDelete = useCallback(async () => {
    Dialog.show({
      content: '确定删除这条决策记录？',
      closeOnAction: true,
      actions: [
        { key: 'cancel', text: '取消' },
        { 
          key: 'delete', 
          text: '删除', 
          danger: true,
          onClick: async () => {
            const result = await deleteDecision(decision.id);
            if (result.success) {
              Toast.show({ content: '已删除', icon: 'success' });
              onRefresh?.();
            } else {
              Toast.show({ content: '删除失败', icon: 'fail' });
            }
          }
        },
      ]
    });
  }, [deleteDecision, decision.id, onRefresh]);

  const handleToggleStatus = async () => {
    const isFinished = ['ENDED', 'CLOSED'].includes(decision.status);
    const newStatus = isFinished ? 'ACTIVE' : 'CLOSED';
    const result = await updateDecision(decision.id, { status: newStatus });
    if (result.success) {
      Toast.show({ content: `状态已变更为 ${STATUS_LABELS[newStatus].label}`, icon: 'success' });
      onRefresh?.();
    } else {
      Toast.show({ content: '状态变更失败', icon: 'fail' });
    }
  };

  const handleAbandonStatus = async () => {
    const isAbandoned = decision.status === 'ABANDONED';
    const newStatus = isAbandoned ? 'ACTIVE' : 'ABANDONED';
    const result = await updateDecision(decision.id, { status: newStatus });
    if (result.success) {
      Toast.show({ content: `状态已变更为 ${STATUS_LABELS[newStatus].label}`, icon: 'success' });
      onRefresh?.();
    } else {
      Toast.show({ content: '状态变更失败', icon: 'fail' });
    }
  };

  const handleShowReviewDetails = () => {
    let logicText = '无';
    let timingText = '无';
    let disciplineText = '无';

    try {
      if (decision.review_content) {
        const ratings = JSON.parse(decision.review_content);
        const LOGIC_MAP = { CORRECT: '判断正确', PARTIAL: '部分正确', WRONG: '逻辑错误' };
        const TIMING_MAP = { GOOD: '极佳', EARLY: '买入偏早', LATE: '买入偏晚', MISSED: '踩空踏空' };
        const DISCIPLINE_MAP = { YES: '完全知行合一', PARTIAL: '轻微违背计划', NO: '情绪化失控' };
        
        logicText = LOGIC_MAP[ratings.logicRating] || ratings.logicRating || '无';
        timingText = TIMING_MAP[ratings.timingRating] || ratings.timingRating || '无';
        disciplineText = DISCIPLINE_MAP[ratings.disciplineRating] || ratings.disciplineRating || '无';
      }
    } catch (e) {
      console.error('[Review Parse Error]:', e);
    }

    Dialog.show({
      title: '📈 决策复盘详情',
      content: (
        <div style={{ textAlign: 'left', lineHeight: 1.6, padding: '10px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>评估结果：</span>
            <span className={decision.is_successful ? 'text-profit' : 'text-loss'} style={{ fontWeight: 'bold' }}>
              {decision.is_successful ? '投资成功 (盈利)' : '投资失败 (亏损)'}
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>盈亏金额：</span>
            <span className={decision.result_pnl >= 0 ? 'text-profit' : 'text-loss'} style={{ fontWeight: 'bold' }}>
              {decision.result_pnl >= 0 ? `+$${decision.result_pnl}` : `-$${Math.abs(decision.result_pnl)}`}
            </span>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: 8, 
            margin: '16px 0', 
            padding: '12px 6px', 
            background: 'var(--color-bg-input)', 
            borderRadius: '6px', 
            fontSize: '11px', 
            border: '1px solid var(--color-border)' 
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>逻辑判断</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{logicText}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>择时择机</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{timingText}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>知行合一</div>
              <div style={{ fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{disciplineText}</div>
            </div>
          </div>
          
          <div style={{ 
            padding: '12px 14px', 
            background: 'rgba(255,255,255,0.01)', 
            borderRadius: '6px', 
            border: '1px solid var(--color-border)',
            marginTop: 12 
          }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 'bold', marginBottom: 6 }}>经验教训与反思</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
              {decision.lessons || '暂无总结'}
            </div>
          </div>
        </div>
      ),
      closeOnAction: true,
      actions: [{ key: 'close', text: '关闭' }],
    });
  };

  const swipeActions = [
    {
      key: 'delete',
      text: '删除',
      color: 'danger',
      onClick: handleDelete,
    },
  ];

  const handleCardClick = (e) => {
    if (onClick) onClick(e);
    setActionSheetVisible(true);
  };

  const isFinished = ['ENDED', 'CLOSED'].includes(decision.status);
  const isAbandoned = decision.status === 'ABANDONED';

  const actions = [
    { text: '编辑记录', key: 'edit', onClick: () => onEdit?.() },
    { 
      text: isFinished ? '重新激活决策' : '归档完结决策', 
      key: 'status', 
      onClick: handleToggleStatus 
    },
    { 
      text: isAbandoned ? '重新激活决策' : '标记放弃决策', 
      key: 'abandon', 
      onClick: handleAbandonStatus 
    },
    { text: '删除记录', key: 'delete', onClick: handleDelete, danger: true },
  ];

  return (
    <>
      <SwipeAction rightActions={swipeActions} className="decision-card__swipe">
        <div
          className={`decision-card decision-card--${sentiment.className}`}
          style={{ animationDelay }}
          onClick={handleCardClick}
        >
          {/* Header: Emoji + Title */}
          <div className="decision-card__header">
            <span className="decision-card__sentiment-emoji">
              {sentiment.emoji}
            </span>
            <span className="decision-card__title">{decision.title}</span>
          </div>

          {/* Content Preview */}
          {decision.content && (
            <div className="decision-card__content">{decision.content}</div>
          )}

          {/* Footer: Confidence, Status, Trade Count */}
          <div className="decision-card__footer">
            <ConfidenceStars value={decision.confidence} />

            <span
              className={`decision-card__status decision-card__status--${status.className}`}
            >
              {status.label}
            </span>

            <div className="decision-card__footer-actions">
              {decision.trade_count > 0 && (
                <span className="decision-card__trade-count decision-card__trade-count--loop">
                  🔗 {decision.trade_count} 笔交易
                </span>
              )}
              
              {decision.review_id ? (
                // Already reviewed
                <button
                  className="decision-card__review-btn"
                  style={{ background: 'var(--color-profit-bg)', color: 'var(--color-profit)', border: '1px solid rgba(0, 212, 170, 0.3)', boxShadow: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowReviewDetails();
                  }}
                >
                  🎯 已复盘 ({decision.result_pnl >= 0 ? `+$${decision.result_pnl}` : `-$${Math.abs(decision.result_pnl)}`})
                </button>
              ) : (
                // Finished, pending review
                isFinished && (
                  <button
                    className="decision-card__review-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReviewForm(true);
                    }}
                  >
                    进行复盘
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </SwipeAction>

      {/* Decision Click Context Action Menu */}
      <ActionSheet
        visible={actionSheetVisible}
        actions={actions}
        onClose={() => setActionSheetVisible(false)}
      />

      {/* Review Form Popup */}
      <Popup
        visible={showReviewForm}
        onMaskClick={() => setShowReviewForm(false)}
        position="bottom"
        bodyStyle={{ height: '95vh' }}
      >
        <ReviewForm
          decision={decision}
          onClose={() => setShowReviewForm(false)}
          onSuccess={() => {
            setShowReviewForm(false);
            onRefresh?.();
          }}
        />
      </Popup>
    </>
  );
}
