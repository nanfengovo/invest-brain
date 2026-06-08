import { useState, useMemo, useCallback } from 'react';
import { SwipeAction, Dialog, Toast, ActionSheet } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { parseDateTime } from '../../utils/time';
import {
  formatLifecyclePnl,
  getTradeAssetDisplay,
  getTradeQuantityUnit,
  getTradeSymbolDisplay,
} from '../../utils/tradeLifecycle';
import { getSyncStatusMeta } from '../../utils/syncStatus';
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

function formatQuantity(num) {
  const number = Number(num) || 0;
  return String(number).replace(/\.0+$/, '');
}

function formatQuantityWithUnit(num, unit) {
  return `${formatQuantity(num)} ${unit || ''}`.trim();
}

function getLifecycleBadge(lifecycle, directionType) {
  if (!lifecycle || lifecycle.status === 'UNTRACKED') return null;
  const unit = lifecycle.unit || '';
  if (lifecycle.status === 'ORPHAN_SELL') {
    return directionType === 'sell'
      ? { label: '缺少买入', type: 'warning' }
      : null;
  }
  if (lifecycle.status === 'OPEN_ONLY') {
    return directionType === 'buy'
      ? {
          label: `未卖出 ${formatQuantityWithUnit(lifecycle.ownOpenQty ?? lifecycle.openQty, unit)}`,
          type: 'open',
        }
      : null;
  }
  if (lifecycle.status === 'PARTIAL') {
    return directionType === 'buy'
      ? lifecycle.ownOpenQty > 0
        ? {
            label: `部分未卖 ${formatQuantityWithUnit(lifecycle.ownOpenQty, unit)}`,
            type: 'partial',
          }
        : null
      : {
          label: `已实现 ${formatLifecyclePnl(lifecycle.realizedPnl)}`,
          type: lifecycle.realizedPnl >= 0 ? 'closed-profit' : 'closed-loss',
        };
  }
  if (lifecycle.status === 'EXPIRED_WORTHLESS') {
    return directionType === 'buy'
      ? {
          label: `到期归零 ${formatLifecyclePnl(lifecycle.realizedPnl)}`,
          type: 'expired',
        }
      : null;
  }
  return directionType === 'sell'
    ? {
        label: `已实现 ${formatLifecyclePnl(lifecycle.realizedPnl)}`,
        type: lifecycle.realizedPnl >= 0 ? 'closed-profit' : 'closed-loss',
      }
    : null;
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
  const displaySymbol = getTradeSymbolDisplay(trade);
  const assetDisplay = getTradeAssetDisplay(trade);
  const quantityUnit = getTradeQuantityUnit(trade);
  const optionDisplay = trade.option_display || null;
  const optionTitle = optionDisplay?.title || '';
  const optionType = optionDisplay?.optionType || trade.option_type || '';
  const expirationTone = trade.option_expiration_risk?.tone || 'unknown';
  const isOption = String(trade.asset_type || '').toUpperCase() === 'OPTION' || !!optionDisplay;
  const lifecycleBadge = getLifecycleBadge(trade.lifecycle, dir.type);
  const authorLabel = String(trade.author || '').trim() || '未标记';
  const syncMeta = getSyncStatusMeta(trade);

  const total = useMemo(() => {
    const qty = parseFloat(trade.quantity) || 0;
    const price = parseFloat(trade.price) || 0;
    return qty * price * (Number(trade.multiplier) || (isOption ? 100 : 1));
  }, [isOption, trade.multiplier, trade.quantity, trade.price]);

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
              <div className="trade-card__symbol">{isOption && optionTitle ? optionTitle : displaySymbol}</div>
              {isOption && optionType && (
                <span className={`trade-card__option-type trade-card__option-type--${optionType.toLowerCase()}`}>
                  {optionType}
                </span>
              )}
              {isOption && trade.option_expiration_label ? (
                <div className={`trade-card__asset-name trade-card__asset-name--option trade-card__asset-name--option-${expirationTone}`}>
                  {trade.option_expiration_label}
                </div>
              ) : assetDisplay && (
                <div className="trade-card__asset-name">{assetDisplay}</div>
              )}
              {lifecycleBadge && (
                <span className={`trade-card__lifecycle trade-card__lifecycle--${lifecycleBadge.type}`}>
                  {lifecycleBadge.label}
                </span>
              )}
              <span className="trade-card__author-tag">
                提交人 {authorLabel}
              </span>
              <span className={`trade-card__sync-tag ${syncMeta.className}`}>
                {syncMeta.label}
              </span>
            </div>
          </div>

          {/* Right: Price × Qty, Total, Time */}
          <div className="trade-card__right">
            <div className="trade-card__price-qty">
              {formatNumber(trade.price)} × {formatQuantityWithUnit(trade.quantity, quantityUnit)}
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
        {(trade.decision_title || trade.account || trade.note || trade.broker || authorLabel) && (
          <div className="trade-card__footer">
            <span className="trade-card__author-tag trade-card__author-tag--footer">
              提交人 {authorLabel}
            </span>
            <span className={`trade-card__sync-tag trade-card__sync-tag--footer ${syncMeta.className}`}>
              {syncMeta.label}
            </span>
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
