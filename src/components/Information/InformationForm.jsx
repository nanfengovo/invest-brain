import { useState, useEffect } from 'react';
import { Form, Input, Button, Selector, Toast, NavBar, TextArea } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { useAppStore } from '../../stores/useAppStore';
import { saveFileToOPFS } from '../../utils/opfsUtils';
import { db } from '../../db/database';
import './InformationForm.css';

const TYPE_OPTIONS = [
  { label: '文章', value: 'ARTICLE' },
  { label: '视频', value: 'VIDEO' },
  { label: '图表/图片', value: 'IMAGE' },
  { label: '书籍/研报', value: 'BOOK' },
];

const splitList = (value) => Array.from(
  new Set(
    String(value || '')
      .split(/[,\n，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
);

const splitSymbols = (value) => splitList(value).map((symbol) => symbol.toUpperCase());

export default function InformationForm({ onClose }) {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [filePath, setFilePath] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const addInformation = useTradeStore((s) => s.addInformation);
  const addMarketWatchItem = useAppStore((s) => s.addMarketWatchItem);

  // Reset form state when component mounts (each time popup opens)
  useEffect(() => {
    form.resetFields();
    setFilePath(null);
    setUploadedFile(null);
  }, [form]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadedFile(file);
    setUploading(true);
    try {
      const path = await saveFileToOPFS(file, 'informations');
      setFilePath(path);
      
      // Auto trigger change to type "IMAGE" if the uploaded file is an image
      if (file.type.startsWith('image/')) {
        form.setFieldsValue({ type: ['IMAGE'] });
      } else if (file.type.startsWith('video/')) {
        form.setFieldsValue({ type: ['VIDEO'] });
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.epub')) {
        form.setFieldsValue({ type: ['BOOK'] });
      }

      Toast.show({ icon: 'success', content: '上传成功' });
      
      // Auto-summarize since a file has been uploaded
      setTimeout(() => triggerAiSummarize(file, path), 300);
    } catch (err) {
      Toast.show({ icon: 'fail', content: '上传失败: ' + err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFilePath(null);
    setUploadedFile(null);
    Toast.show({ content: '附件已移除' });
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const triggerAiSummarize = async (fileObj = null, pathVal = null) => {
    const urlVal = form.getFieldValue('url');
    const contentVal = form.getFieldValue('content');
    const targetFile = fileObj || uploadedFile;

    if (!urlVal && !contentVal && !targetFile) {
      return; // Nothing to summarize
    }

    setSummarizing(true);
    const toast = Toast.show({
      icon: 'loading',
      content: 'AI 智能提炼标题...',
      duration: 0,
    });

    try {
      let base64Image = null;
      let mimeType = 'image/png';
      
      if (targetFile && targetFile.type.startsWith('image/')) {
        base64Image = await fileToBase64(targetFile);
        mimeType = targetFile.type;
      }

      const localApiKey = useAppStore.getState().geminiApiKey;
      const headers = { 'Content-Type': 'application/json' };
      if (localApiKey) {
        headers['x-gemini-api-key'] = localApiKey;
      }

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: urlVal || undefined,
          content: contentVal || undefined,
          image: base64Image || undefined,
          mimeType,
        }),
      });

      toast.close();

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.title) {
        form.setFieldsValue({ title: result.title });
        
        // If API extracted content (like from X oEmbed), append it to the content textarea
        if (result.content) {
          const currentContent = form.getFieldValue('content') || '';
          let newContentText = '';
          if (result.author) {
            newContentText = `作者: ${result.author}\n${result.content}`;
          } else {
            newContentText = result.content;
          }
          
          if (!currentContent.includes(result.content)) {
            form.setFieldsValue({
              content: currentContent ? `${currentContent}\n\n---\n\n${newContentText}` : newContentText
            });
            Toast.show({ icon: 'success', content: '标题与推文正文已提取' });
          } else {
            Toast.show({ icon: 'success', content: '标题自动提炼成功' });
          }
        } else {
          Toast.show({ icon: 'success', content: '标题自动提炼成功' });
        }
      }
    } catch (err) {
      console.error('[AI Summarize Error]:', err);
      toast.close();
      Toast.show({ icon: 'fail', content: '提炼失败: ' + err.message });
    } finally {
      setSummarizing(false);
    }
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      let assetId = null;
      const assetIds = splitSymbols(values.asset_ids_text);
      const sectors = splitList(values.sectors_text);

      // If user provided asset codes, upsert asset records first.
      for (const symbol of assetIds) {
        assetId = assetId || symbol;
        try {
          await db.upsertAsset({
            id: symbol,
            symbol: symbol,
            name: symbol,
            type: 'STOCK',
            sector: sectors[0] || null,
          });
          addMarketWatchItem({
            symbol,
            name: symbol,
            quoteType: 'EQUITY',
            typeDisp: '股票',
          });
        } catch (err) {
          console.warn('[InformationForm] Asset upsert failed:', err);
        }
      }

      const info = {
        id: crypto.randomUUID(),
        title: values.title,
        type: values.type ? values.type[0] : 'ARTICLE',
        url: values.url || null,
        content: values.content || null,
        asset_id: assetId,
        asset_ids: assetIds,
        sector: sectors[0] || null,
        sectors,
        file_path: filePath,
      };
      
      const res = await addInformation(info);
      if (res.success) {
        Toast.show({ icon: 'success', content: '保存成功' });
        // Reset form for next entry
        form.resetFields();
        setFilePath(null);
        setUploadedFile(null);
        onClose();
      } else {
        Toast.show({ icon: 'fail', content: '保存失败: ' + (res.error || '未知错误') });
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '保存失败: ' + err.message });
    } finally {
      setSaving(false);
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
            <Button block type="submit" color="primary" size="large" loading={saving}>
              保存
            </Button>
          }
          initialValues={{ type: ['ARTICLE'] }}
        >
          <Form.Header>基础信息</Form.Header>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="输入情报标题，或使用下方智能提炼" clearable />
          </Form.Item>
          
          <div className="info-form__ai-summarize-row">
            <button
              type="button"
              className="info-form__ai-summarize-btn"
              onClick={() => triggerAiSummarize()}
              disabled={summarizing}
            >
              {summarizing ? '🤖 正在提炼...' : '✨ AI 智能提炼标题'}
            </button>
          </div>
          
          <Form.Item name="type" label="类型">
            <Selector
              options={TYPE_OPTIONS}
              columns={2}
              onChange={(arr) => form.setFieldsValue({ type: arr })}
            />
          </Form.Item>
          
          <Form.Item name="url" label="来源链接 (可选)">
            <Input 
              placeholder="输入文章或视频的网址" 
              clearable 
              onBlur={() => triggerAiSummarize()}
            />
          </Form.Item>

          <Form.Item name="content" label="情报内容 (可选)">
            <TextArea 
              placeholder="输入正文内容、摘录或您的看法，输入完毕可自动提炼标题..." 
              rows={4} 
              showCount 
              maxLength={2000}
              onBlur={() => triggerAiSummarize()}
            />
          </Form.Item>
          
          <Form.Header>关联数据</Form.Header>
          <Form.Item name="asset_ids_text" label="关联股票/资产代码">
            <Input placeholder="可多个，用逗号分隔，如 AAPL,NVDA,TSLA" clearable />
          </Form.Item>
          
          <Form.Item name="sectors_text" label="关联模块/板块">
            <Input placeholder="可多个，用逗号分隔，如 AI,半导体,电网" clearable />
          </Form.Item>
          
          <Form.Header>附件上传</Form.Header>
          <Form.Item>
            <div className="info-form__upload">
              <label className="info-form__upload-btn">
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.epub"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                {uploading ? '上传中...' : '选择图片、视频、PDF 或 EPUB'}
              </label>
              {filePath && (
                <div className="info-form__upload-info">
                  <div className="info-form__upload-path">
                    📎 {filePath.split('/').pop()}
                  </div>
                  <button
                    type="button"
                    className="info-form__upload-remove"
                    onClick={handleRemoveFile}
                  >
                    ✕ 移除
                  </button>
                </div>
              )}
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
