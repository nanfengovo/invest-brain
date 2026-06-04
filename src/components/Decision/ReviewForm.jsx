import { useState } from 'react';
import { Form, Input, Button, Selector, TextArea, Toast, NavBar } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import './ReviewForm.css';

const LOGIC_OPTIONS = [
  { label: '🎯 判断正确', value: 'CORRECT' },
  { label: '🌗 部分正确', value: 'PARTIAL' },
  { label: '❌ 逻辑错误', value: 'WRONG' },
];

const TIMING_OPTIONS = [
  { label: '🔥 极佳', value: 'GOOD' },
  { label: '⏳ 买入偏早', value: 'EARLY' },
  { label: '⌛ 买入偏晚', value: 'LATE' },
  { label: '🕳️ 踩空踏空', value: 'MISSED' },
];

const DISCIPLINE_OPTIONS = [
  { label: '🤝 完美知行合一', value: 'YES' },
  { label: '🩹 轻微违背计划', value: 'PARTIAL' },
  { label: '😤 情绪化失控', value: 'NO' },
];

const SUCCESS_OPTIONS = [
  { label: '🎉 投资成功 (盈利/达成目标)', value: '1' },
  { label: '📉 投资失败 (亏损/不达预期)', value: '0' },
];

export default function ReviewForm({ decision, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const addReview = useTradeStore((s) => s.addReview);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const isSuccessful = parseInt(values.is_successful?.[0] || '1', 10);
      const resultPnl = parseFloat(values.result_pnl || '0');

      const review_content = JSON.stringify({
        logicRating: values.logicRating?.[0] || 'CORRECT',
        timingRating: values.timingRating?.[0] || 'GOOD',
        disciplineRating: values.disciplineRating?.[0] || 'YES',
      });

      const review = {
        id: crypto.randomUUID(),
        decision_id: decision.id,
        review_content,
        is_successful: isSuccessful,
        lessons: values.lessons || '',
        result_pnl: resultPnl,
      };

      const res = await addReview(review);
      if (res.success) {
        Toast.show({ icon: 'success', content: '复盘已保存' });
        onSuccess?.();
        onClose();
      } else {
        Toast.show({ icon: 'fail', content: '保存失败: ' + (res.error || '数据库写入错误') });
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '保存失败: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-form">
      <NavBar onBack={onClose}>添加决策复盘</NavBar>
      <div className="review-form__content">
        <Form
          form={form}
          onFinish={onFinish}
          footer={
            <Button block type="submit" color="primary" size="large" disabled={saving}>
              {saving ? '保存中...' : '提交复盘'}
            </Button>
          }
          initialValues={{
            is_successful: ['1'],
            logicRating: ['CORRECT'],
            timingRating: ['GOOD'],
            disciplineRating: ['YES'],
          }}
        >
          <div className="review-form__header-info">
            <div className="review-form__decision-title">🎯 复盘决策: {decision.title}</div>
            <div className="review-form__decision-desc">
              复盘将自动结束本条决策的生命周期，数据将归档为“已完结”状态。
            </div>
          </div>

          <div className="review-form__section-title">三维灵魂拷问</div>

          <Form.Item name="logicRating" label="1. 逻辑判断 (当初的信息分析对了吗？)">
            <Selector options={LOGIC_OPTIONS} columns={3} />
          </Form.Item>

          <Form.Item name="timingRating" label="2. 择时择机 (买卖的时机点好不好？)">
            <Selector options={TIMING_OPTIONS} columns={2} />
          </Form.Item>

          <Form.Item name="disciplineRating" label="3. 知行合一 (严格执行最初的计划了吗？)">
            <Selector options={DISCIPLINE_OPTIONS} columns={1} />
          </Form.Item>

          <div className="review-form__section-title">结果与反思</div>

          <Form.Item name="is_successful" label="结果评估">
            <Selector options={SUCCESS_OPTIONS} columns={1} />
          </Form.Item>

          <Form.Item 
            name="result_pnl" 
            label="盈亏金额 ($，支持负数)"
            rules={[{ required: true, message: '请输入盈亏金额' }]}
          >
            <Input type="number" placeholder="0.00" inputMode="decimal" clearable />
          </Form.Item>

          <Form.Item name="lessons" label="反思与核心经验教训">
            <TextArea
              placeholder="当初哪里看对了？哪里买错了？有哪些经验可以总结在以后的交易中？"
              rows={4}
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
