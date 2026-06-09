import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './OptionAlertSheet.css';

const extractPriceText = (value) => {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match?.[0] || '';
};

export default function OptionAlertSheet({
  open,
  title,
  subtitle,
  defaultValue = '>',
  metaItems = [],
  onClose,
  onSubmit,
}) {
  const [input, setInput] = useState(defaultValue);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const condition = String(input || '').trim().startsWith('<') ? 'BELOW' : 'ABOVE';
  const targetText = extractPriceText(input);
  const visibleMetaItems = useMemo(
    () => metaItems.filter((item) => item?.label && item?.value && item.value !== '--').slice(0, 6),
    [metaItems]
  );

  useEffect(() => {
    if (!open) return;
    setInput(defaultValue || '>');
    setSubmitting(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [defaultValue, open]);

  if (!open || typeof document === 'undefined') return null;

  const setCondition = (nextCondition) => {
    const prefix = nextCondition === 'BELOW' ? '<' : '>';
    setInput(`${prefix}${targetText}`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const keepOpen = await onSubmit?.(input);
      if (keepOpen === false) {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  };

  return createPortal((
    <div className="option-alert-sheet__mask" onClick={onClose}>
      <form
        className="option-alert-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="option-alert-sheet-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="option-alert-sheet__bar" aria-hidden="true" />
        <div className="option-alert-sheet__header">
          <div>
            <span>Option Monitor</span>
            <h3 id="option-alert-sheet-title">{title || '设置期权提醒'}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭期权提醒设置">
            关闭
          </button>
        </div>

        <div className="option-alert-sheet__condition" aria-label="选择提醒条件">
          <button
            type="button"
            className={condition === 'ABOVE' ? 'active' : ''}
            onClick={() => setCondition('ABOVE')}
          >
            高于等于
          </button>
          <button
            type="button"
            className={condition === 'BELOW' ? 'active' : ''}
            onClick={() => setCondition('BELOW')}
          >
            低于等于
          </button>
        </div>

        <label className="option-alert-sheet__input">
          <span>触发价格</span>
          <input
            ref={inputRef}
            value={input}
            inputMode="decimal"
            placeholder="例如 >1.50 或 <0.80"
            onChange={(event) => setInput(event.target.value)}
          />
        </label>

        {visibleMetaItems.length > 0 && (
          <div className="option-alert-sheet__meta">
            {visibleMetaItems.map((item) => (
              <span key={item.label}>
                <em>{item.label}</em>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        )}

        <div className="option-alert-sheet__hint">
          输入 <strong>&gt;1.50</strong> 表示价格高于等于触发，输入 <strong>&lt;0.80</strong> 表示价格低于等于触发。
        </div>

        <div className="option-alert-sheet__actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? '保存中' : '保存提醒'}
          </button>
        </div>
      </form>
    </div>
  ), document.body);
}
