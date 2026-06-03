import { useCallback, useState } from 'react';
import { SwipeAction, Dialog, Toast, ActionSheet } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import './DecisionCard.css';

const SENTIMENT_MAP = {
  BULLISH: { emoji: '🚀', className: 'bullish' },
  BEARISH: { emoji: '📉', className: 'bearish' },
  NEUTRAL: { emoji: '⚖️', className: 'neutral' },
};

const STATUS_LABELS = {
  ACTIVE: { label: '进行中', className: 'active' },
  CLOSED: { label: '已结束', className: 'closed' },
  PAUSED: { label: '暂停', className: 'paused' },
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
 */
export default function DecisionCard({ decision, index = 0, onClick, onEdit }) {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
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
            } else {
              Toast.show({ content: '删除失败', icon: 'fail' });
            }
          }
        },
      ]
    });
  }, [deleteDecision, decision.id]);

  const handleToggleStatus = async () => {
    const newStatus = ['ENDED', 'CLOSED'].includes(decision.status) ? 'ACTIVE' : 'CLOSED';
    const result = await updateDecision(decision.id, { status: newStatus });
    if (result.success) {
      Toast.show({ content: `状态已变更为 ${STATUS_LABELS[newStatus].label}`, icon: 'success' });
    } else {
      Toast.show({ content: '状态变更失败', icon: 'fail' });
    }
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

  const actions = [
    { text: '编辑记录', key: 'edit', onClick: () => onEdit?.() },
    { 
      text: ['ENDED', 'CLOSED'].includes(decision.status) ? '重新激活决策' : '结束决策', 
      key: 'status', 
      onClick: handleToggleStatus 
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
              {['ENDED', 'CLOSED'].includes(decision.status) && (
                <button
                  className="decision-card__review-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    Toast.show({ content: '复盘功能开发中...', icon: 'edit' });
                  }}
                >
                  进行复盘
                </button>
              )}
            </div>
          </div>
        </div>
      </SwipeAction>

      <ActionSheet
        visible={actionSheetVisible}
        actions={actions}
        onClose={() => setActionSheetVisible(false)}
        onAction={(action) => {
          action.onClick?.();
          setActionSheetVisible(false);
        }}
        cancelText="取消"
      />
    </>
  );
}
