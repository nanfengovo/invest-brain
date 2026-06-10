import React from 'react';
import { ActionSheet, Dialog, Toast } from 'antd-mobile';
import { db } from '../db/database';

const NVIDIA_MODELS = [
  {
    label: 'Qwen Image',
    value: 'qwen-image',
    description: '默认推荐，中文语义和海报构图更稳',
  },
  {
    label: 'Qwen Image 2512',
    value: 'qwen-image-2512',
    description: 'OpenAI-compatible 图像接口模型名，失败会自动兜底',
  },
  {
    label: 'FLUX.2 Klein 4B',
    value: 'flux.2-klein-4b',
    description: '速度与质感均衡，适合金融科技背景',
  },
  {
    label: 'FLUX.1 Schnell',
    value: 'flux.1-schnell',
    description: '生成速度优先，适合抽象背景快速出图',
  },
  {
    label: 'Stable Diffusion 3.5 Large',
    value: 'stabilityai/stable-diffusion-3.5-large',
    description: '画面质感优先，适合封面级背景',
  },
];

const POLLINATIONS_MODELS = [
  {
    label: 'Pollinations FLUX',
    value: 'pollinations-flux',
    provider: 'pollinations',
    description: '免配置尝试源，画面质量较好；当前可能有队列或限流',
  },
  {
    label: 'Pollinations Turbo',
    value: 'pollinations-turbo',
    provider: 'pollinations',
    description: '免配置尝试源，速度优先；失败时会显示具体原因',
  },
];

const AI_BACKGROUND_MODELS = [
  ...POLLINATIONS_MODELS,
  ...NVIDIA_MODELS.map((item) => ({
    ...item,
    provider: 'nvidia',
  })),
];

const LOCAL_BACKGROUNDS = [
  {
    label: '深海雷达',
    value: 'radar',
    description: '蓝绿光源，适合行情和复盘',
    background: {
      template: 'signal-card',
      palette: ['#06111f', '#0f172a', '#020617'],
      accent: '#38bdf8',
      accent2: '#2dd4bf',
      pattern: 'orbital',
    },
  },
  {
    label: '期权钟摆',
    value: 'theta',
    description: '琥珀与紫色，适合期权交易',
    background: {
      template: 'signal-card',
      palette: ['#150f1f', '#1f1733', '#050816'],
      accent: '#f59e0b',
      accent2: '#a78bfa',
      pattern: 'grid',
    },
  },
  {
    label: '冷静账本',
    value: 'ledger',
    description: '低调暗色，数字可读性最高',
    background: {
      template: 'ledger-clean',
      palette: ['#07111f', '#111827', '#020617'],
      accent: '#8ea2ff',
      accent2: '#64748b',
      pattern: 'none',
    },
  },
  {
    label: '收益勋章',
    value: 'badge',
    description: '类似排行榜徽章，适合行情亮点和总结',
    background: {
      template: 'badge-card',
      palette: ['#06111f', '#0f2c44', '#1f4c68'],
      accent: '#38bdf8',
      accent2: '#facc15',
      pattern: 'none',
    },
  },
  {
    label: '红色战报',
    value: 'pop-profit',
    description: '强品牌色，适合收益、交易和期权战报',
    background: {
      template: 'pop-profit',
      palette: ['#f43f5e', '#e11d48', '#be123c'],
      accent: '#f43f5e',
      accent2: '#ffffff',
      pattern: 'none',
    },
  },
];

function showActionChoice({ title, extra, actions }) {
  return new Promise((resolve) => {
    let handler = null;
    handler = ActionSheet.show({
      extra,
      actions,
      cancelText: '取消',
      closeOnAction: true,
      onAction: (action) => {
        resolve(action);
      },
      onClose: () => {
        resolve(null);
      },
      afterClose: () => {
        handler = null;
      },
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('背景图读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('背景图加载失败'));
    image.src = src;
  });
}

function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.click();
  });
}

async function chooseLocalBackground() {
  const action = await showActionChoice({
    extra: '选择本地生成的背景风格，不依赖任何外部 API',
    actions: LOCAL_BACKGROUNDS.map((item) => ({
      key: item.value,
      text: item.label,
      description: item.description,
    })),
  });
  if (!action) return null;
  return LOCAL_BACKGROUNDS.find((item) => item.value === action.key)?.background || null;
}

async function chooseUploadedBackground() {
  const file = await pickImageFile();
  if (!file) return null;
  if (!file.type.startsWith('image/')) {
    Toast.show({ icon: 'fail', content: '请选择图片文件' });
    return null;
  }
  const dataUrl = await readFileAsDataUrl(file);
  return {
    image: await loadImage(dataUrl),
    source: 'upload',
  };
}

async function getShareBackgroundConfig() {
  try {
    const [raw, globalNvidiaApiKey] = await Promise.all([
      db.getSetting('share_background_config'),
      db.getSetting('nvidia_api_key'),
    ]);
    const config = raw ? JSON.parse(raw) : {};
    return {
      ...config,
      nvidiaApiKey: String(config.nvidiaApiKey || globalNvidiaApiKey || '').trim(),
    };
  } catch (error) {
    console.warn('Failed to load share background config:', error);
    return {};
  }
}

function buildDefaultPrompt(posterConfig = {}) {
  return [
    'Create a premium abstract financial technology background for a Chinese trading review poster.',
    'No text, no numbers, no logos, no watermark.',
    `Theme: ${posterConfig.typeLabel || 'investment review'}.`,
    `Main topic: ${posterConfig.title || 'market and trading analysis'}.`,
    'High contrast dark glassmorphism, cinematic lighting, clean negative space in the center.',
    'Aspect ratio 3:4, suitable for a 1080x1440 poster.',
  ].join(' ');
}

function showAiPromptDialog({ prompt, model, provider }) {
  return new Promise((resolve) => {
    let nextPrompt = prompt;
    let nextModel = model;
    let handler = null;
    handler = Dialog.show({
      title: 'AI 生成背景',
      content: (
        <div className="share-background-dialog">
          <div className="share-background-dialog__field">
            <label>模型</label>
            <input
              className="share-background-dialog__input"
              defaultValue={nextModel}
              placeholder="qwen-image"
              onChange={(event) => {
                nextModel = event.target.value;
              }}
            />
          </div>
          <p className="share-background-dialog__hint">
            当前来源：{provider === 'pollinations' ? 'Pollinations 免配置尝试' : 'NVIDIA NIM'}
          </p>
          <div className="share-background-dialog__field">
            <label>提示词</label>
            <textarea
              className="share-background-dialog__textarea"
              defaultValue={nextPrompt}
              rows={6}
              onChange={(event) => {
                nextPrompt = event.target.value;
              }}
            />
          </div>
          <p className="share-background-dialog__hint">
            建议只生成抽象背景，不要让 AI 生成文字和收益数字。
          </p>
        </div>
      ),
      closeOnAction: true,
      actions: [
        { key: 'cancel', text: '取消' },
        {
          key: 'confirm',
          text: '生成背景',
          bold: true,
          onClick: () => {
            resolve({
              prompt: nextPrompt,
              model: nextModel,
            });
          },
        },
      ],
      onClose: () => resolve(null),
      afterClose: () => {
        handler = null;
      },
    });
  });
}

async function chooseAiModel(config) {
  const action = await showActionChoice({
    extra: '只生成背景层，二维码、标题、收益和数据仍由本地模板绘制',
    actions: AI_BACKGROUND_MODELS.map((item) => ({
      key: item.value,
      text: item.label,
      description: item.description,
      provider: item.provider,
      bold: item.value === (config.defaultModel || 'qwen-image'),
    })),
  });
  return action || null;
}

async function generateAiBackground(posterConfig = {}) {
  const config = await getShareBackgroundConfig();
  const selected = await chooseAiModel(config);
  if (!selected) return null;
  const selectedModel = selected.key;
  const selectedProvider = selected.provider || (selectedModel.startsWith('pollinations-') ? 'pollinations' : 'nvidia');

  const promptResult = await showAiPromptDialog({
    prompt: buildDefaultPrompt(posterConfig),
    model: selectedModel,
    provider: selectedProvider,
  });
  if (!promptResult) return null;

  Toast.show({
    icon: 'loading',
    content: 'AI 背景生成中...',
    duration: 0,
  });

  try {
    const response = await fetch('/api/share-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(selectedProvider === 'nvidia' && config.nvidiaApiKey ? { 'x-nvidia-api-key': config.nvidiaApiKey } : {}),
      },
      body: JSON.stringify({
        mode: 'share-background',
        provider: selectedProvider,
        model: promptResult.model || selectedModel,
        prompt: promptResult.prompt,
        width: 1080,
        height: 1440,
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.image) {
      throw new Error(json.error || 'AI 背景生成失败');
    }

    const image = await loadImage(json.image);
    Toast.clear();
    const providerLabel = json.provider === 'pollinations' ? 'Pollinations' : 'NVIDIA';
    Toast.show({ icon: 'success', content: `背景已生成：${providerLabel} · ${json.model || promptResult.model}` });
    return {
      image,
      source: json.provider || selectedProvider,
      model: json.model || promptResult.model,
      prompt: promptResult.prompt,
    };
  } catch (error) {
    Toast.clear();
    const message = String(error?.message || '').trim();
    const readableMessage = /Body is unusable|Failed to fetch|NetworkError/i.test(message)
      ? 'AI 背景接口响应异常或网络不可用'
      : (message || 'AI 背景生成失败');
    Toast.show({ content: `${readableMessage}，请换模型或稍后重试` });
    return null;
  }
}

export async function chooseSharePosterBackground(posterConfig = {}) {
  if (typeof document === 'undefined') return null;
  const config = await getShareBackgroundConfig();

  const action = await showActionChoice({
    extra: '分享图文字和数据仍由本地模板绘制，背景可单独选择',
    actions: [
      {
        key: 'local',
        text: '选择本地背景',
        description: '随机/纹理背景，最快且完全本地',
        bold: (config.provider || 'local') === 'local',
      },
      {
        key: 'upload',
        text: '使用我的图片',
        description: '从本机选择一张图作为背景，不上传',
      },
      {
        key: 'ai',
        text: 'AI 生成背景',
        description: '使用 Pollinations / NVIDIA 的图像模型生成背景',
        bold: ['pollinations', 'nvidia'].includes(config.provider),
      },
      {
        key: 'default',
        text: '直接生成默认分享图',
        description: '跳过选择，使用当前模板默认背景',
      },
    ],
  });

  if (!action || action.key === 'default') return null;
  if (action.key === 'local') return chooseLocalBackground();
  if (action.key === 'upload') return chooseUploadedBackground();
  if (action.key === 'ai') return generateAiBackground(posterConfig);
  return null;
}

export const SHARE_BACKGROUND_MODELS = AI_BACKGROUND_MODELS;
