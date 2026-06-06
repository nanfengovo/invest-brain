import { useEffect, useMemo, useState } from 'react';
import { Form, Input, TextArea, Selector, Toast } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { db } from '../../db/database';
import AssetSelector from '../common/AssetSelector';
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

const PRIORITY_OPTIONS = [
  { label: '普通', value: '2' },
  { label: '重要', value: '3' },
  { label: '高优先', value: '4' },
  { label: '核心', value: '5' },
];

const splitList = (value) => String(value || '')
  .split(/[,\n，、]/)
  .map((item) => item.trim())
  .filter(Boolean);

const firstLinkedValue = (value) => splitList(value)[0] || '';

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
 * @param {object} props.sourceInformation - Information record used as decision evidence
 */
export default function DecisionForm({ onClose, onSuccess, initialData, sourceInformation }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [confidence, setConfidence] = useState(initialData?.confidence || 3);
  const [informations, setInformations] = useState([]);
  const [infoSearch, setInfoSearch] = useState('');
  const [selectedInfoIds, setSelectedInfoIds] = useState(() => {
    const fromInitial = splitList(initialData?.info_ids);
    if (fromInitial.length > 0) return fromInitial;
    return sourceInformation?.id ? [sourceInformation.id] : [];
  });

  useEffect(() => {
    let mounted = true;
    db.getInformations()
      .then((items) => {
        if (mounted) setInformations(items || []);
      })
      .catch((err) => console.warn('Failed to load information evidence list:', err));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (initialData) {
      setConfidence(initialData.confidence || 3);
      setSelectedInfoIds(splitList(initialData.info_ids));
      form.setFieldsValue({
        title: initialData.title,
        content: initialData.content,
        sentiment: [initialData.sentiment || 'NEUTRAL'],
        status: [initialData.status || 'ACTIVE'],
        priority: [String(initialData.priority || 3)],
        asset_id: initialData.asset_id || '',
        sector: initialData.sector || '',
      });
      return;
    }

    setConfidence(3);
    setSelectedInfoIds(sourceInformation?.id ? [sourceInformation.id] : []);
    form.setFieldsValue({
      title: '',
      content: '',
      sentiment: ['NEUTRAL'],
      status: ['ACTIVE'],
      priority: ['3'],
      asset_id: firstLinkedValue(sourceInformation?.asset_symbols || sourceInformation?.asset_symbol || sourceInformation?.asset_id),
      sector: firstLinkedValue(sourceInformation?.sectors || sourceInformation?.sector),
    });
  }, [form, initialData, sourceInformation]);

  const evidenceOptions = useMemo(() => {
    const keyword = infoSearch.trim().toLowerCase();
    const list = keyword
      ? informations.filter((item) => {
          const haystack = [
            item.title,
            item.asset_symbols,
            item.asset_symbol,
            item.asset_id,
            item.sectors,
            item.sector,
            item.source,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(keyword);
        })
      : informations;

    return list.slice(0, 12);
  }, [infoSearch, informations]);

  const selectedEvidence = useMemo(() => {
    const byId = new Map(informations.map((item) => [item.id, item]));
    if (sourceInformation?.id && !byId.has(sourceInformation.id)) {
      byId.set(sourceInformation.id, sourceInformation);
    }
    return selectedInfoIds.map((infoId) => byId.get(infoId)).filter(Boolean);
  }, [informations, selectedInfoIds, sourceInformation]);

  const applyEvidenceContext = (info) => {
    if (!info || initialData) return;
    const current = form.getFieldsValue();
    const assetId = firstLinkedValue(info.asset_symbols || info.asset_symbol || info.asset_id);
    const sector = firstLinkedValue(info.sectors || info.sector);
    form.setFieldsValue({
      asset_id: current.asset_id || assetId,
      sector: current.sector || sector,
    });
  };

  const toggleEvidence = (info) => {
    setSelectedInfoIds((prev) => {
      if (prev.includes(info.id)) {
        return prev.filter((id) => id !== info.id);
      }
      applyEvidenceContext(info);
      return [...prev, info.id];
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const sentiment = values.sentiment?.[0] || 'NEUTRAL';
      const status = values.status?.[0] || 'ACTIVE';
      const priority = Number(values.priority?.[0] || 3);
      const store = useTradeStore.getState();

      if (initialData) {
        // Edit mode
        const updates = {
          title: values.title.trim(),
          content: values.content || '',
          sentiment,
          confidence,
          status,
          asset_id: values.asset_id || null,
          sector: values.sector || null,
          priority,
          info_ids: selectedInfoIds,
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
          asset_id: values.asset_id || null,
          sector: values.sector || null,
          priority,
          info_ids: selectedInfoIds,
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
                  priority: [String(initialData.priority || 3)],
                  asset_id: initialData.asset_id,
                  sector: initialData.sector,
                }
              : {
                  sentiment: ['NEUTRAL'],
                  status: ['ACTIVE'],
                  priority: ['3'],
                  asset_id: firstLinkedValue(sourceInformation?.asset_symbols || sourceInformation?.asset_symbol || sourceInformation?.asset_id),
                  sector: firstLinkedValue(sourceInformation?.sectors || sourceInformation?.sector),
                }
          }
          footer={null}
        >
          <div className="decision-form__section-title">基本信息</div>

          <Form.Item name="asset_id" label="关联股票/资产代码 (可选)">
            <AssetSelector />
          </Form.Item>
          
          <Form.Item name="sector" label="关联板块 (可选)">
            <Input placeholder="如: 科技, AI" clearable />
          </Form.Item>

          <div className="decision-form__evidence-panel">
            <div className="decision-form__evidence-head">
              <div>
                <div className="decision-form__evidence-title">信息证据</div>
                <div className="decision-form__evidence-subtitle">
                  一个决策可以绑定多条信息，后续复盘可追溯来源
                </div>
              </div>
              <span className="decision-form__evidence-count">{selectedInfoIds.length}</span>
            </div>
            <Input
              value={infoSearch}
              onChange={setInfoSearch}
              placeholder="搜索标题、股票、模块"
              clearable
              className="decision-form__evidence-search"
            />
            {selectedEvidence.length > 0 && (
              <div className="decision-form__selected-evidence">
                {selectedEvidence.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="decision-form__selected-evidence-chip"
                    onClick={() => toggleEvidence(item)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
            <div className="decision-form__evidence-list">
              {evidenceOptions.map((item) => {
                const checked = selectedInfoIds.includes(item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`decision-form__evidence-item ${checked ? 'is-selected' : ''}`}
                    onClick={() => toggleEvidence(item)}
                  >
                    <span className="decision-form__evidence-check">{checked ? '✓' : '+'}</span>
                    <span className="decision-form__evidence-copy">
                      <span className="decision-form__evidence-name">{item.title}</span>
                      <span className="decision-form__evidence-meta">
                        {item.asset_symbols || item.asset_symbol || item.asset_id || '未绑定标的'}
                        {item.sectors || item.sector ? ` · ${item.sectors || item.sector}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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

          <Form.Item name="priority" label="生命周期重要度">
            <Selector options={PRIORITY_OPTIONS} />
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
