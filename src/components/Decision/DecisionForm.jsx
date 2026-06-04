import { useState } from 'react';
import { Form, Input, TextArea, Selector, Toast } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import './DecisionForm.css';

const SENTIMENT_OPTIONS = [
  { label: '🚀 看多', value: 'BULLISH' },
  { label: '📉 看空', value: 'BEARISH' },
  { label: '⚖️ 中性', value: 'NEUTRAL' },
];

const STATUS_OPTIONS = [
  { label: '📝 观点草稿', value: 'DRAFT' },
  { label: '👀 观望计划', value: 'WATCH' },
  { label: '🚀 进行中/持仓', value: 'ACTIVE' },
  { label: '✅ 已完结', value: 'CLOSED' },
  { label: '🗑️ 已放弃', value: 'ABANDONED' },
];

/**
 * Interactive star rating component (1–5).
 */
function StarRating({ value = 0, onChange }) {
  return (
    <div className="decision-form__star-rating">
      <span className="decision-form__star-label">信心指数</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`decision-form__star ${
            star <= value
              ? 'decision-form__star--filled'
              : 'decision-form__star--empty'
          }`}
          onClick={() => onChange?.(star === value ? 0 : star)}
        >
          ⭐
        </span>
      ))}
    </div>
  );
}

/**
 * DecisionForm — Full-screen decision/thesis entry form.
 *
 * @param {object} props
 * @param {function} props.onClose - Close the form
 * @param {function} props.onSuccess - Callback after successful save
 * @param {object} props.initialData - If provided, edits an existing decision
 */
export default function DecisionForm({ onClose, onSuccess, initialData }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [confidence, setConfidence] = useState(initialData?.confidence || 3);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const sentiment = values.sentiment?.[0] || 'NEUTRAL';
      const status = values.status?.[0] || 'ACTIVE';
      const store = useTradeStore.getState();

      if (initialData) {
        // Edit mode
        const updates = {
          title: values.title.trim(),
          content: values.content || '',
          sentiment,
          confidence,
          status,
        };
        const result = await store.updateDecision(initialData.id, updates);
        if (result.success) {
          Toast.show({ content: '决策已更新', icon: 'success' });
          onSuccess?.();
          onClose?.();
        } else {
          Toast.show({ content: result.error || '更新失败', icon: 'fail' });
        }
      } else {
        // Create mode
        const decision = {
          id: crypto.randomUUID(),
          title: values.title.trim(),
          content: values.content || '',
          sentiment,
          confidence,
          status,
          created_at: new Date().toISOString(),
        };

        const result = await store.addDecision(decision);

        if (result.success) {
          Toast.show({ content: '决策已保存', icon: 'success' });
          onSuccess?.();
          onClose?.();
        } else {
          Toast.show({ content: result.error || '保存失败', icon: 'fail' });
        }
      }
    } catch {
      // Validation failed
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="decision-form">
      {/* Header */}
      <div className="decision-form__header">
        <button className="decision-form__header-btn" onClick={onClose}>
          ✕
        </button>
        <span className="decision-form__title">
          {initialData ? '编辑决策' : '新建决策'}
        </span>
        <button
          className="decision-form__save-btn"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* Form Body */}
      <div className="decision-form__body">
        <Form
          form={form}
          layout="horizontal"
          initialValues={
            initialData
              ? {
                  title: initialData.title,
                  content: initialData.content,
                  sentiment: [initialData.sentiment],
                  status: [initialData.status || 'ACTIVE'],
                }
              : {
                  sentiment: ['NEUTRAL'],
                  status: ['ACTIVE'],
                }
          }
          footer={null}
        >
          <div className="decision-form__section-title">基本信息</div>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="例如: 看好NVDA AI算力需求" clearable />
          </Form.Item>

          <Form.Item name="content" label="核心逻辑">
            <TextArea
              placeholder="记录你的投资思考..."
              maxLength={2000}
              rows={5}
              showCount
            />
          </Form.Item>

          <div className="decision-form__section-title">状态与判断</div>

          <Form.Item name="status" label="当前状态">
            <Selector options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item name="sentiment" label="情绪方向">
            <Selector options={SENTIMENT_OPTIONS} />
          </Form.Item>

          <StarRating value={confidence} onChange={setConfidence} />
        </Form>
      </div>
    </div>
  );
}
