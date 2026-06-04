import { useState, useMemo, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Selector,
  DatePicker,
  TextArea,
  Toast,
  Picker,
  ActionSheet,
} from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { parseTradeImage } from '../../utils/ocrWorker';
import './TradeForm.css';

const ASSET_TYPE_OPTIONS = [
  { label: '正股', value: 'STOCK' },
  { label: '期权', value: 'OPTION' },
  { label: 'ETF', value: 'ETF' },
];

const DIRECTION_OPTIONS = [
  { label: '买入', value: 'BUY' },
  { label: '卖出', value: 'SELL' },
  { label: '开仓', value: 'OPEN' },
  { label: '平仓', value: 'CLOSE' },
];

/**
 * TradeForm — Full-screen trade entry form.
 *
 * @param {object} props
 * @param {function} props.onClose - Close the form
 * @param {function} props.onSuccess - Callback after successful save
 * @param {object} props.initialData - Optional initial trade data for editing
 */
export default function TradeForm({ onClose, onSuccess, initialData }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [assetType, setAssetType] = useState(['STOCK']);
  const [decisionPickerVisible, setDecisionPickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [expiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [tradeTime, setTradeTime] = useState(new Date());
  const [expiryDate, setExpiryDate] = useState(null);
  const [selectedDecision, setSelectedDecision] = useState(null);
  const [infoPickerVisible, setInfoPickerVisible] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [ocrTrades, setOcrTrades] = useState([]);
  const [ocrSheetVisible, setOcrSheetVisible] = useState(false);
  const [ocrCandidates, setOcrCandidates] = useState({ symbols: [], numbers: [] });
  const [activeField, setActiveField] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);

  // Cleanup object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (referenceImage) URL.revokeObjectURL(referenceImage);
    };
  }, [referenceImage]);

  const decisions = useTradeStore((s) => s.decisions);
  const refreshDecisions = useTradeStore((s) => s.refreshDecisions);
  const informations = useTradeStore((s) => s.informations);
  const refreshInformations = useTradeStore((s) => s.refreshInformations);

  // Load decisions and info for the picker
  useEffect(() => {
    refreshDecisions();
    refreshInformations();
  }, [refreshDecisions, refreshInformations]);

  // Populate form if editing
  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({
        symbol: initialData.symbol || '',
        asset_name: initialData.asset_name || '',
        quantity: initialData.quantity?.toString() || '',
        price: initialData.price?.toString() || '',
        fee: initialData.fee?.toString() || '0',
        account: initialData.account || '',
        note: initialData.note || '',
        strike_price: initialData.strike_price?.toString() || '',
        direction: initialData.direction ? [initialData.direction] : ['BUY'],
      });
      setAssetType([initialData.asset_type || 'STOCK']);
      setSelectedDecision(initialData.decision_id || null);
      setSelectedInfo(initialData.info_id || null);
      if (initialData.trade_time) setTradeTime(new Date(initialData.trade_time));
      if (initialData.expiry_date) setExpiryDate(new Date(initialData.expiry_date));
    }
  }, [initialData, form]);

  const decisionColumns = useMemo(() => {
    const items = decisions.map((d) => ({
      label: d.title,
      value: d.id,
    }));
    return [items.length > 0 ? items : [{ label: '暂无决策', value: '' }]];
  }, [decisions]);

  const infoColumns = useMemo(() => {
    const items = informations.map((i) => ({
      label: i.title || (i.content ? i.content.substring(0, 15) : '信息'),
      value: i.id,
    }));
    return [items.length > 0 ? items : [{ label: '暂无关联信息', value: '' }]];
  }, [informations]);

  /** Fill form with a single OCR trade result */
  const applyOcrTrade = (data) => {
    const updates = {};
    if (data.symbol) updates.symbol = data.symbol;
    if (data.direction) updates.direction = [data.direction];
    if (data.price) updates.price = data.price.toString();
    if (data.quantity) updates.quantity = data.quantity.toString();
    if (data.strike_price) updates.strike_price = data.strike_price.toString();

    if (data.asset_type === 'OPTION') {
      setAssetType(['OPTION']);
      if (data.expiry_date) setExpiryDate(new Date(data.expiry_date));
    }

    if (Object.keys(updates).length > 0) {
      form.setFieldsValue(updates);
      Toast.show({ icon: 'success', content: '已填入表单' });
    }
  };

  const handleOcrInput = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 显示参考图 (对比录入法核心)
    if (referenceImage) URL.revokeObjectURL(referenceImage);
    setReferenceImage(URL.createObjectURL(file));

    const toastHandler = Toast.show({
      icon: 'loading',
      content: '识别中...',
      duration: 0,
    });

    try {
      const { trades, candidates } = await parseTradeImage(file);
      
      if (candidates) {
        setOcrCandidates(candidates);
      }

      if (!trades || trades.length === 0) {
        Toast.show({ icon: 'fail', content: '未提取出完整的交易，请点击下方输入框使用智能提示' });
        return;
      }

      if (trades.length === 1) {
        // Single trade — fill directly
        applyOcrTrade(trades[0]);
      } else {
        // Multiple trades — show selection sheet
        setOcrTrades(trades);
        setOcrSheetVisible(true);
      }
    } catch (err) {
      console.error(err);
      Toast.show({ icon: 'fail', content: '识别失败' });
    } finally {
      toastHandler.close();
      e.target.value = '';
    }
  };

  /** Build ActionSheet actions from OCR trades */
  const ocrActions = ocrTrades.map((t, i) => {
    const dir = t.direction === 'BUY' ? '买入' : t.direction === 'SELL' ? '卖出' : '?';
    const sym = t.symbol || '未知';
    const price = t.price ? `$${t.price}` : '';
    const qty = t.quantity ? `×${t.quantity}` : '';
    const optTag = t.asset_type === 'OPTION' ? ' [期权]' : '';
    return {
      text: `${dir} ${sym} ${price} ${qty}${optTag}`,
      key: String(i),
      onClick: () => {
        applyOcrTrade(t);
        setOcrSheetVisible(false);
      },
    };
  });

  const isOption = assetType[0] === 'OPTION';

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const symbol = (values.symbol || '').toUpperCase().trim();
      const direction = values.direction?.[0];
      const type = assetType[0];

      // Build asset_id: symbol for stocks, symbol_strike_expiry for options
      let assetId = symbol;
      if (isOption && values.strike_price) {
        const expStr = expiryDate
          ? expiryDate.toISOString().slice(0, 10)
          : '';
        assetId = `${symbol}_${values.strike_price}_${expStr}`;
      }

      const trade = {
        id: initialData ? initialData.id : crypto.randomUUID(),
        asset_id: assetId,
        symbol,
        asset_name: values.asset_name || '',
        asset_type: type,
        direction,
        quantity: parseFloat(values.quantity),
        price: parseFloat(values.price),
        fee: parseFloat(values.fee || '0'),
        account: values.account || '',
        decision_id: selectedDecision || null,
        info_id: selectedInfo || null,
        trade_time: tradeTime.toISOString(),
        note: values.note || '',
        // Option-specific
        strike_price: isOption ? parseFloat(values.strike_price || '0') : null,
        expiry_date: isOption && expiryDate ? expiryDate.toISOString().slice(0, 10) : null,
      };

      const result = initialData 
        ? await useTradeStore.getState().updateTrade(trade)
        : await useTradeStore.getState().addTrade(trade);

      if (result.success) {
        Toast.show({ content: initialData ? '更新成功' : '交易已保存', icon: 'success' });
        onSuccess?.();
        onClose?.();
      } else {
        Toast.show({ content: result.error || '保存失败', icon: 'fail' });
      }
    } catch {
      // Validation failed — antd-mobile will show field errors
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="trade-form">
      {/* Header */}
      <div className="trade-form__header">
        <button className="trade-form__header-btn" onClick={onClose}>
          ✕
        </button>
        <span className="trade-form__title">新建交易</span>
        <button
          className="trade-form__save-btn"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* Form Body */}
      <div className="trade-form__body">
        
        {/* 对比录入区 (Phase 1 MVP) */}
        {referenceImage && (
          <div className="trade-form__reference-image">
            <div className="trade-form__reference-header">
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>参照截图 (可滑动查看下方表单)</span>
              <button 
                onClick={() => {
                  URL.revokeObjectURL(referenceImage);
                  setReferenceImage(null);
                  setOcrCandidates({ symbols: [], numbers: [] });
                }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 18 }}
              >✕</button>
            </div>
            <img src={referenceImage} alt="Reference" style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
          </div>
        )}

        {/* 智能候选词胶囊栏 */}
        {(ocrCandidates.symbols?.length > 0 || ocrCandidates.numbers?.length > 0) && activeField && (
          <div className="trade-form__candidates-bar">
            <div className="trade-form__candidates-title">智能提取 (点击填入):</div>
            <div className="trade-form__candidates-scroll">
              {(activeField === 'symbol' ? ocrCandidates.symbols : ocrCandidates.numbers).map((item, idx) => (
                <span 
                  key={`${item}-${idx}`} 
                  className="trade-form__candidate-tag"
                  onMouseDown={(e) => {
                    // Prevent input blur so we don't lose activeField
                    e.preventDefault(); 
                    form.setFieldsValue({ [activeField]: item });
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        <Form
          form={form}
          layout="horizontal"
          initialValues={{
            fee: '0',
            direction: ['BUY'],
          }}
          footer={null}
        >
          {/* ── Basic Info ── */}
          <div className="trade-form__section-header">
            <div className="trade-form__section-title" style={{ marginTop: 0 }}>基本信息</div>
            <label className="trade-form__ocr-btn">
              📸 截图提取数据
              <input
                type="file"
                accept="image/*"
                onChange={handleOcrInput}
                className="trade-form__ocr-input"
              />
            </label>
          </div>

          <Form.Item
            name="symbol"
            label="股票代码"
            rules={[{ required: true, message: '请输入代码' }]}
            className="trade-form__symbol-input"
          >
            <Input 
              placeholder="例如 AAPL" 
              clearable 
              onFocus={() => setActiveField('symbol')}
              onBlur={() => setTimeout(() => setActiveField(null), 150)}
            />
          </Form.Item>

          <Form.Item name="asset_name" label="股票名称">
            <Input placeholder="例如 苹果公司" clearable />
          </Form.Item>

          <Form.Item name="asset_type" label="资产类型">
            <Selector
              options={ASSET_TYPE_OPTIONS}
              value={assetType}
              onChange={(val) => {
                if (val.length > 0) setAssetType(val);
              }}
            />
          </Form.Item>

          <Form.Item
            name="direction"
            label="买卖方向"
            rules={[{ required: true, message: '请选择方向' }]}
          >
            <Selector options={DIRECTION_OPTIONS} />
          </Form.Item>

          {/* ── Pricing ── */}
          <div className="trade-form__section-title">价格数量</div>

          <Form.Item
            name="quantity"
            label="数量"
            rules={[{ required: true, message: '请输入数量' }]}
            className="trade-form__number-input"
          >
            <Input 
              type="number" 
              placeholder="0" 
              inputMode="decimal" 
              clearable 
              onFocus={() => setActiveField('quantity')}
              onBlur={() => setTimeout(() => setActiveField(null), 150)}
            />
          </Form.Item>

          <Form.Item
            name="price"
            label="价格"
            rules={[{ required: true, message: '请输入价格' }]}
            className="trade-form__number-input"
          >
            <Input 
              type="number" 
              placeholder="0.00" 
              inputMode="decimal" 
              clearable 
              onFocus={() => setActiveField('price')}
              onBlur={() => setTimeout(() => setActiveField(null), 150)}
            />
          </Form.Item>

          <Form.Item
            name="fee"
            label="手续费"
            className="trade-form__number-input"
          >
            <Input 
              type="number" 
              placeholder="0" 
              inputMode="decimal" 
              clearable 
            />
          </Form.Item>

          {/* ── Option-specific Fields ── */}
          {isOption && (
            <div className="trade-form__option-fields">
              <div className="trade-form__section-title">期权信息</div>

              <Form.Item
                name="strike_price"
                label="行权价"
                className="trade-form__number-input"
              >
                <Input
                  type="number"
                  placeholder="0.00"
                  inputMode="decimal"
                  clearable
                  onFocus={() => setActiveField('strike_price')}
                  onBlur={() => setTimeout(() => setActiveField(null), 150)}
                />
              </Form.Item>

              <div
                className="trade-form__picker-trigger"
                onClick={() => setExpiryPickerVisible(true)}
              >
                <span className="trade-form__picker-label">到期日</span>
                <span
                  className={`trade-form__picker-value ${
                    !expiryDate ? 'trade-form__picker-value--placeholder' : ''
                  }`}
                >
                  {expiryDate ? formatDateShort(expiryDate) : '请选择'}
                  <span className="trade-form__picker-arrow"> ›</span>
                </span>
              </div>

               {expiryPickerVisible && (
                <DatePicker
                  visible={true}
                  onClose={() => setExpiryPickerVisible(false)}
                  onConfirm={(val) => {
                    setExpiryDate(val);
                    setExpiryPickerVisible(false);
                  }}
                  value={expiryDate || new Date()}
                  title="到期日"
                  min={new Date(2020, 0, 1)}
                  max={new Date(2030, 11, 31)}
                  renderLabel={(type, data) => {
                    switch (type) {
                      case 'year': return data + '年';
                      case 'month': return data + '月';
                      case 'day': return data + '日';
                      default: return data;
                    }
                  }}
                />
               )}
            </div>
          )}

          {/* ── Additional ── */}
          <div className="trade-form__section-title">其他信息</div>

          <Form.Item name="account" label="账户">
            <Input placeholder="例如 LongBridge" clearable />
          </Form.Item>

          {/* Decision Picker */}
          <div
            className="trade-form__picker-trigger"
            onClick={() => setDecisionPickerVisible(true)}
          >
            <span className="trade-form__picker-label">关联决策</span>
            <span
              className={`trade-form__picker-value ${
                !selectedDecision ? 'trade-form__picker-value--placeholder' : ''
              }`}
            >
              {selectedDecision
                ? decisions.find((d) => d.id === selectedDecision)?.title || '已选'
                : '无'}
              <span className="trade-form__picker-arrow"> ›</span>
            </span>
          </div>

          <Picker
            columns={decisionColumns}
            visible={decisionPickerVisible}
            onClose={() => setDecisionPickerVisible(false)}
            onConfirm={(val) => {
              const v = val?.[0];
              setSelectedDecision(v || null);
              setDecisionPickerVisible(false);
            }}
            title="关联决策"
          />

          {/* Info Picker */}
          <div
            className="trade-form__picker-trigger"
            onClick={() => setInfoPickerVisible(true)}
          >
            <span className="trade-form__picker-label">关联信息</span>
            <span
              className={`trade-form__picker-value ${
                !selectedInfo ? 'trade-form__picker-value--placeholder' : ''
              }`}
            >
              {selectedInfo
                ? informations.find((i) => i.id === selectedInfo)?.title || '已选'
                : '无'}
              <span className="trade-form__picker-arrow"> ›</span>
            </span>
          </div>

          <Picker
            columns={infoColumns}
            visible={infoPickerVisible}
            onClose={() => setInfoPickerVisible(false)}
            onConfirm={(val) => {
              const v = val?.[0];
              setSelectedInfo(v || null);
              setInfoPickerVisible(false);
            }}
            title="关联信息"
          />

          {/* Trade Time Picker */}
          <div
            className="trade-form__picker-trigger"
            onClick={() => setDatePickerVisible(true)}
          >
            <span className="trade-form__picker-label">交易时间</span>
            <span className="trade-form__picker-value">
              {formatDate(tradeTime)}
              <span className="trade-form__picker-arrow"> ›</span>
            </span>
          </div>

          {datePickerVisible && (
            <DatePicker
              visible={true}
              onClose={() => setDatePickerVisible(false)}
              onConfirm={(val) => {
                setTradeTime(val);
                setDatePickerVisible(false);
              }}
              value={tradeTime}
              precision="minute"
              title="交易时间"
              min={new Date(2020, 0, 1)}
              max={new Date(2030, 11, 31, 23, 59)}
              renderLabel={(type, data) => {
                switch (type) {
                  case 'year': return data + '年';
                  case 'month': return data + '月';
                  case 'day': return data + '日';
                  case 'hour': return data + '时';
                  case 'minute': return data + '分';
                  default: return data;
                }
              }}
            />
          )}

          <Form.Item name="note" label="备注">
            <TextArea
              placeholder="补充说明..."
              maxLength={500}
              rows={3}
              showCount
            />
          </Form.Item>
        </Form>
      </div>

      {/* OCR Multi-Trade Selection Sheet */}
      <ActionSheet
        visible={ocrSheetVisible}
        actions={ocrActions}
        onClose={() => setOcrSheetVisible(false)}
        cancelText="取消"
        extra={<div style={{ textAlign: 'center', fontSize: 14, color: 'var(--color-text-secondary)', padding: '8px 0' }}>识别到 {ocrTrades.length} 笔交易，请选择一笔填入</div>}
      />
    </div>
  );
}
