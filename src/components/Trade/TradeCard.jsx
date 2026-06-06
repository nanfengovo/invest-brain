import { useState, useMemo, useCallback } from 'react';
import { SwipeAction, Dialog, Toast, ActionSheet } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { parseDateTime } from '../../utils/time';
import './TradeCard.css';

const DIRECTION_MAP = {
  BUY: { label: '买入', type: 'buy' },
  SELL: { label: '卖出', type: 'sell' },
  OPEN: { label: '开仓', type: 'buy' },
  CLOSE: { label: '平仓', type: 'sell' },
};

/**
 * Format a trade timestamp into a relative time string or date.
 */
function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = parseDateTime(dateStr);
  if (!date) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHr < 24) return `${diffHr}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

/**
 * Format number with comma separators.
 */
function formatNumber(num) {
  if (num == null) return '—';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * TradeCard — displays a single trade record as a glass card.
 *
 * @param {object} props
 * @param {object} props.trade - Trade record object
 * @param {number} [props.index=0] - Index for stagger animation delay
 * @param {function} [props.onEdit] - Edit callback
 */
export default function TradeCard({ trade, index = 0, onEdit, compactMode = false }) {
  const deleteTrade = useTradeStore((s) => s.deleteTrade);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const dir = DIRECTION_MAP[trade.direction] || { label: trade.direction, type: 'buy' };
  const isBuy = dir.type === 'buy';

  const total = useMemo(() => {
    const qty = parseFloat(trade.quantity) || 0;
    const price = parseFloat(trade.price) || 0;
    return qty * price;
  }, [trade.quantity, trade.price]);

  const animationDelay = useMemo(() => `${Math.min(index * 0.05, 0.5)}s`, [index]);

  const handleDelete = useCallback(async () => {
    Dialog.show({
      content: '确定删除这条交易记录？',
      closeOnAction: true,
      actions: [
        { key: 'cancel', text: '取消' },
        { 
          key: 'delete', 
          text: '删除', 
          danger: true,
          onClick: async () => {
            const result = await deleteTrade(trade.id);
            if (result.success) {
              Toast.show({ content: '已删除', icon: 'success' });
            } else {
              Toast.show({ content: '删除失败', icon: 'fail' });
            }
          }
        },
      ]
    });
  }, [deleteTrade, trade.id]);

  const swipeActions = [
    {
      key: 'delete',
      text: '删除',
      color: 'danger',
      onClick: handleDelete,
    },
  ];

  const actionSheetActions = [
    { text: '编辑', key: 'edit' },
    { text: '删除', key: 'delete', danger: true },
  ];

  const handleAction = (action) => {
    setActionSheetVisible(false);
    if (action.key === 'edit') {
      onEdit?.(trade);
    } else if (action.key === 'delete') {
      handleDelete();
    }
  };

  return (
    <SwipeAction rightActions={swipeActions} className="trade-card__swipe">
      <div
        className={`trade-card ${isBuy ? 'trade-card--buy' : 'trade-card--sell'} ${compactMode ? 'trade-card--compact' : ''}`}
        style={{ animationDelay }}
        onClick={() => setActionSheetVisible(true)}
      >
        <div className="trade-card__body">
          {/* Left: Direction + Symbol */}
          <div className="trade-card__left">
            <span
              className={`trade-card__direction-badge ${
                isBuy
                  ? 'trade-card__direction-badge--buy'
                  : 'trade-card__direction-badge--sell'
              }`}
            >
              {dir.label}
            </span>
            <div className="trade-card__info">
              <div className="trade-card__symbol">{trade.symbol}</div>
              {trade.asset_name && (
                <div className="trade-card__asset-name">{trade.asset_name}</div>
              )}
            </div>
          </div>

          {/* Right: Price × Qty, Total, Time */}
          <div className="trade-card__right">
            <div className="trade-card__price-qty">
              {formatNumber(trade.price)} × {trade.quantity}
            </div>
            <div className="trade-card__total">
              $ {formatNumber(total)}
            </div>
            <div className="trade-card__time">
              {formatTimeAgo(trade.trade_time)}
            </div>
          </div>
        </div>

        {/* Footer: Decision Tag / Broker / Account / Note */}
        {(trade.decision_title || trade.account || trade.note || trade.broker) && (
          <div className="trade-card__footer">
            {trade.broker && (
              <span className="trade-card__broker-tag">{trade.broker}</span>
            )}
            {trade.decision_title && (
              <span className="trade-card__decision-tag">
                {trade.decision_title}
              </span>
            )}
            {trade.account && (
              <span className="trade-card__account-tag">{trade.account}</span>
            )}
            {trade.note && !trade.decision_title && (
              <span className="trade-card__note-dot" title={trade.note} />
            )}
          </div>
        )}
      </div>

      <ActionSheet
        visible={actionSheetVisible}
        actions={actionSheetActions}
        onClose={() => setActionSheetVisible(false)}
        onAction={handleAction}
        cancelText="取消"
      />
    </SwipeAction>
  );
}
