import { useState } from 'react';
import { Form, Input, Button, Selector, Toast, NavBar } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { saveFileToOPFS } from '../../utils/opfsUtils';
import './InformationForm.css';

const TYPE_OPTIONS = [
  { label: '文章', value: 'ARTICLE' },
  { label: '视频', value: 'VIDEO' },
  { label: '图表/图片', value: 'IMAGE' },
  { label: '书籍/研报', value: 'BOOK' },
];

export default function InformationForm({ onClose }) {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [filePath, setFilePath] = useState(null);
  
  const addInformation = useTradeStore((s) => s.addInformation);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const path = await saveFileToOPFS(file, 'informations');
      setFilePath(path);
      Toast.show({ icon: 'success', content: '上传成功' });
    } catch (err) {
      Toast.show({ icon: 'fail', content: '上传失败: ' + err.message });
    } finally {
      setUploading(false);
    }
  };

  const onFinish = async (values) => {
    const info = {
      title: values.title,
      type: values.type ? values.type[0] : 'ARTICLE',
      url: values.url || null,
      asset_id: values.asset_id || null,
      sector: values.sector || null,
      file_path: filePath,
    };
    
    const res = await addInformation(info);
    if (res.success) {
      Toast.show({ icon: 'success', content: '保存成功' });
      onClose();
    } else {
      Toast.show({ icon: 'fail', content: '保存失败' });
    }
  };

  return (
    <div className="info-form">
      <NavBar onBack={onClose}>添加情报/信息</NavBar>
      <div className="info-form__content">
        <Form
          form={form}
          onFinish={onFinish}
          footer={
            <Button block type="submit" color="primary" size="large">
              保存
            </Button>
          }
          initialValues={{ type: ['ARTICLE'] }}
        >
          <Form.Header>基础信息</Form.Header>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="输入情报标题" clearable />
          </Form.Item>
          
          <Form.Item name="type" label="类型">
            <Selector
              options={TYPE_OPTIONS}
              columns={2}
              onChange={(arr) => form.setFieldsValue({ type: arr })}
            />
          </Form.Item>
          
          <Form.Item name="url" label="来源链接 (可选)">
            <Input placeholder="输入文章或视频的网址" clearable />
          </Form.Item>
          
          <Form.Header>关联数据</Form.Header>
          <Form.Item name="asset_id" label="关联股票/资产代码 (可选)">
            <Input placeholder="如: AAPL, BTC" clearable />
          </Form.Item>
          
          <Form.Item name="sector" label="关联板块 (可选)">
            <Input placeholder="如: 科技, AI" clearable />
          </Form.Item>
          
          <Form.Header>附件上传</Form.Header>
          <Form.Item>
            <div className="info-form__upload">
              <label className="info-form__upload-btn">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                {uploading ? '上传中...' : '选择图片或PDF文件'}
              </label>
              {filePath && (
                <div className="info-form__upload-path">
                  已上传: {filePath.split('/').pop()}
                </div>
              )}
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
