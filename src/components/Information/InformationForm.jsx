import { useState, useEffect } from 'react';
import { Form, Input, Button, Selector, Toast, NavBar, TextArea } from 'antd-mobile';
import { useTradeStore } from '../../stores/useTradeStore';
import { useAppStore } from '../../stores/useAppStore';
import { saveFileToOPFS } from '../../utils/opfsUtils';
import { buildAiRequestBody, buildAiRequestHeaders, getAiUsageLabel } from '../../utils/aiProviders';
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

function appendUniqueBlock(current, next) {
  const currentText = String(current || '').trim();
  const nextText = String(next || '').trim();
  if (!nextText) return currentText;
  if (currentText.includes(nextText)) return currentText;
  return currentText ? `${currentText}\n\n---\n\n${nextText}` : nextText;
}

function mediaLinesFromParsed(parsed) {
  const lines = [];
  if (parsed?.media?.embedUrl) lines.push(`视频嵌入: ${parsed.media.embedUrl}`);
  if (parsed?.media?.provider) lines.push(`视频平台: ${parsed.media.provider}`);
  if (parsed?.media?.primaryVideo && parsed.media.primaryVideo !== parsed?.media?.embedUrl) {
    lines.push(`视频地址: ${parsed.media.primaryVideo}`);
  }
  if (parsed?.media?.primaryImage) lines.push(`封面地址: ${parsed.media.primaryImage}`);
  return lines.join('\n');
}

function canSummarizeUploadedFile(file) {
  return Boolean(file?.type?.startsWith('image/'));
}

function getMissingSummarizeInputMessage(type, file) {
  if (type === 'BOOK') {
    return file
      ? '当前书籍/研报附件没有抽取到可解析正文，请手动补充摘录，或重新上传可解析的 PDF/EPUB'
      : '请先上传 PDF/EPUB，或填写来源链接/正文摘录后再解析书籍/研报';
  }

  if (type === 'VIDEO') {
    return file
      ? '本地视频附件已保存，但解析需要视频链接或正文摘录，请补充后再试'
      : '请先填写视频链接、正文摘录，或上传可解析图片后再解析';
  }

  if (type === 'IMAGE') {
    return '请先上传图片，或填写来源链接/正文内容后再解析';
  }

  return '请先填写来源链接、正文内容，或上传图片/PDF/EPUB 后再解析';
}

function normalizeSummarizeErrorMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return '解析服务暂时没有返回原因，请稍后重试';
  const lowerRaw = raw.toLowerCase();
  if (lowerRaw.includes('provide') && lowerRaw.includes('url') && lowerRaw.includes('content') && lowerRaw.includes('image')) {
    return '请提供来源链接、正文内容或图片后再解析。书籍/研报请先上传 PDF/EPUB 或填写摘录';
  }
  if (/Method not allowed/i.test(raw)) return '当前解析接口仅支持 POST 请求';
  if (/HTTP 400/.test(raw)) return '解析输入不完整，请补充来源链接、正文内容或图片';
  return raw;
}

export default function InformationForm({ onClose }) {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [filePath, setFilePath] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const addInformation = useTradeStore((s) => s.addInformation);
  const addMarketWatchItem = useAppStore((s) => s.addMarketWatchItem);
  const syncUserId = useAppStore((s) => s.syncUserId);

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
      
      let extractedDocument = null;

      if (file.type.startsWith('image/')) {
        form.setFieldsValue({ type: ['IMAGE'] });
      } else if (file.type.startsWith('video/')) {
        form.setFieldsValue({ type: ['VIDEO'] });
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.epub')) {
        form.setFieldsValue({ type: ['BOOK'] });
        try {
          const { extractDocumentText } = await import('../../utils/documentParser');
          extractedDocument = await extractDocumentText(file);
          if (extractedDocument?.content) {
            const currentContent = form.getFieldValue('content') || '';
            const fileTitle = extractedDocument.title ? `# ${extractedDocument.title}\n\n` : '';
            form.setFieldsValue({
              title: form.getFieldValue('title') || extractedDocument.title || file.name.replace(/\.[^.]+$/, ''),
              content: appendUniqueBlock(currentContent, `${fileTitle}${extractedDocument.content}`),
            });
          }
        } catch (err) {
          console.warn('[InformationForm] Document extraction failed:', err);
          Toast.show({ content: '附件已保存，正文抽取失败，可手动补充摘录' });
        }
      }

      Toast.show({ icon: 'success', content: '上传成功' });
      
      setTimeout(() => triggerAiSummarize(file, path, { silent: true }), extractedDocument?.content ? 100 : 300);
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

  const triggerAiSummarize = async (fileObj = null, pathVal = null, options = {}) => {
    const { silent = false } = options;
    const urlVal = String(form.getFieldValue('url') || '').trim();
    const contentVal = String(form.getFieldValue('content') || '').trim();
    const targetFile = fileObj || uploadedFile;
    const selectedType = form.getFieldValue('type')?.[0] || 'ARTICLE';
    const hasSummarizableFile = canSummarizeUploadedFile(targetFile);

    if (!urlVal && !contentVal && !hasSummarizableFile) {
      if (!silent) {
        Toast.show({
          icon: 'fail',
          content: getMissingSummarizeInputMessage(selectedType, targetFile),
        });
      }
      return;
    }

    setSummarizing(true);
    const toast = Toast.show({
      icon: 'loading',
      content: '正在解析信息...',
      duration: 0,
    });

    try {
      let base64Image = null;
      let mimeType = targetFile?.type || 'text/plain';
      
      if (hasSummarizableFile) {
        base64Image = await fileToBase64(targetFile);
        mimeType = targetFile.type;
      }

      const { geminiApiKey, nvidiaApiKey, aiProviderConfig } = useAppStore.getState();
      const headers = buildAiRequestHeaders({ geminiApiKey, nvidiaApiKey });

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers,
        body: JSON.stringify(buildAiRequestBody(aiProviderConfig, {
          url: urlVal || undefined,
          content: contentVal || undefined,
          image: base64Image || undefined,
          mimeType,
        })),
      });

      toast.close();

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const parsed = result.parsed || {};
      if (result.title) {
        const updates = { title: result.title };
        if (parsed.type) updates.type = [parsed.type];

        const parsedContent = parsed.content || result.content;
        const mediaLines = mediaLinesFromParsed(parsed);
        if (parsedContent || mediaLines) {
          const authorLine = parsed.source?.author || result.author;
          let newContentText = parsedContent
            ? (authorLine ? `作者: ${authorLine}\n${parsedContent}` : parsedContent)
            : (result.summary ? `摘要: ${result.summary}` : '');
          if (mediaLines) newContentText += `\n${mediaLines}`;
          updates.content = appendUniqueBlock(form.getFieldValue('content'), newContentText);
        }

        form.setFieldsValue(updates);
        const modelLabel = getAiUsageLabel(result);
        Toast.show({
          icon: 'success',
          content: `${parsedContent ? '信息已解析并回填' : '标题已解析'}${modelLabel ? ` · ${modelLabel}` : ''}`,
        });
      }
    } catch (err) {
      console.error('[AI Summarize Error]:', err);
      toast.close();
      Toast.show({ icon: 'fail', content: `解析失败：${normalizeSummarizeErrorMessage(err.message)}` });
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
        author: syncUserId || localStorage.getItem('invest_sync_user_id') || '未标记',
        workspace_scope: 'personal',
        source_scope: 'personal',
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
            <Input placeholder="输入情报标题，或使用解析信息自动生成" clearable />
          </Form.Item>
          
          <div className="info-form__ai-summarize-row">
            <button
              type="button"
              className="info-form__ai-summarize-btn"
              onClick={() => triggerAiSummarize(null, null, { silent: false })}
              disabled={summarizing}
            >
              {summarizing ? '正在解析...' : '解析信息'}
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
              onBlur={() => triggerAiSummarize(null, null, { silent: true })}
            />
          </Form.Item>

          <Form.Item name="content" label="情报内容 (可选)">
            <TextArea 
              placeholder="输入正文、摘录、Markdown 或 HTML；也可以粘贴链接后解析"
              rows={4} 
              showCount 
              maxLength={12000}
              onBlur={() => triggerAiSummarize(null, null, { silent: true })}
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
