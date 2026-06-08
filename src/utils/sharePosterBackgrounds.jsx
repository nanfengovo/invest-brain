import React from 'react';
import { ActionSheet, Dialog, Toast } from 'antd-mobile';
import { db } from '../db/database';

const NVIDIA_MODELS = [
  {
    label: 'Qwen Image 2512',
    value: 'qwen-image-2512',
    description: '中文语义和海报构图优先，适合分享背景',
  },
  {
    label: 'Qwen Image',
    value: 'qwen-image',
    description: 'NVIDIA Build 可用的通用图像模型',
  },
  {
    label: 'FLUX.2 Klein 4B',
    value: 'flux.2-klein-4b',
    description: '速度优先，适合抽象金融氛围图',
  },
  {
    label: 'Stable Diffusion 3.5 Large',
    value: 'stabilityai/stable-diffusion-3.5-large',
    description: '画面质感更强，但生成成本通常更高',
  },
];

const LOCAL_BACKGROUNDS = [
  {
    label: '深海雷达',
    value: 'radar',
    description: '蓝绿光源，适合行情和复盘',
    background: {
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
      palette: ['#07111f', '#111827', '#020617'],
      accent: '#8ea2ff',
      accent2: '#64748b',
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

function showAiPromptDialog({ prompt, model }) {
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
              placeholder="qwen-image-2512"
              onChange={(event) => {
                nextModel = event.target.value;
              }}
            />
          </div>
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
    extra: 'NVIDIA Build / NIM 图像模型，只用于生成背景层',
    actions: NVIDIA_MODELS.map((item) => ({
      key: item.value,
      text: item.label,
      description: item.description,
      bold: item.value === (config.defaultModel || 'qwen-image-2512'),
    })),
  });
  return action?.key || null;
}

async function generateAiBackground(posterConfig = {}) {
  const config = await getShareBackgroundConfig();
  const selectedModel = await chooseAiModel(config);
  if (!selectedModel) return null;

  const promptResult = await showAiPromptDialog({
    prompt: buildDefaultPrompt(posterConfig),
    model: selectedModel,
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
        ...(config.nvidiaApiKey ? { 'x-nvidia-api-key': config.nvidiaApiKey } : {}),
      },
      body: JSON.stringify({
        mode: 'share-background',
        provider: 'nvidia',
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
    Toast.show({ icon: 'success', content: `背景已生成：${json.model || promptResult.model}` });
    return {
      image,
      source: 'nvidia',
      model: json.model || promptResult.model,
      prompt: promptResult.prompt,
    };
  } catch (error) {
    Toast.clear();
    Toast.show({ content: `${error.message || 'AI 背景生成失败'}，已使用本地背景` });
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
        text: 'NVIDIA AI 生成',
        description: '使用 Qwen/FLUX 等模型生成背景',
        bold: config.provider === 'nvidia',
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

export const SHARE_BACKGROUND_MODELS = NVIDIA_MODELS;
