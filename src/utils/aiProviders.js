export const AI_PROVIDER_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: 'NVIDIA', value: 'nvidia' },
  { label: 'Gemini', value: 'gemini' },
];

export const AI_TEXT_MODEL_OPTIONS = [
  {
    label: 'Nemotron Super 49B',
    value: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    provider: 'NVIDIA',
    description: '默认文本/翻译/诊断',
  },
  {
    label: 'Nemotron Ultra 253B',
    value: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    provider: 'NVIDIA',
    description: '复杂诊断',
  },
  {
    label: 'Llama 3.3 70B',
    value: 'meta/llama-3.3-70b-instruct',
    provider: 'NVIDIA',
    description: '通用稳定',
  },
  {
    label: 'Mistral Small 4',
    value: 'mistralai/mistral-small-4-119b-2603',
    provider: 'NVIDIA',
    description: '长上下文',
  },
  {
    label: 'Gemma 4 31B',
    value: 'google/gemma-4-31b-it',
    provider: 'NVIDIA',
    description: '轻量快速',
  },
  {
    label: 'DeepSeek R1',
    value: 'deepseek-ai/deepseek-r1',
    provider: 'NVIDIA',
    description: '推理复盘',
  },
  {
    label: 'Gemini 3.1 Lite',
    value: 'gemini-3.1-flash-lite',
    provider: 'Gemini',
    description: '高配额',
  },
  {
    label: 'Gemini 3.5 Flash',
    value: 'gemini-3.5-flash',
    provider: 'Gemini',
    description: '高精度',
  },
];

export const AI_VISION_MODEL_OPTIONS = [
  {
    label: 'Llama 3.2 Vision 90B',
    value: 'meta/llama-3.2-90b-vision-instruct',
    provider: 'NVIDIA',
    description: 'NVIDIA 视觉 OCR',
  },
  {
    label: 'Llama 3.2 Vision 11B',
    value: 'meta/llama-3.2-11b-vision-instruct',
    provider: 'NVIDIA',
    description: '更快的视觉模型',
  },
  {
    label: 'Mistral Small 4',
    value: 'mistralai/mistral-small-4-119b-2603',
    provider: 'NVIDIA',
    description: '多模态候选',
  },
  {
    label: 'Gemini 3.5 Flash',
    value: 'gemini-3.5-flash',
    provider: 'Gemini',
    description: '默认 OCR',
  },
  {
    label: 'Gemini 3.1 Lite',
    value: 'gemini-3.1-flash-lite',
    provider: 'Gemini',
    description: '高配额',
  },
];

export const DEFAULT_AI_PROVIDER_CONFIG = {
  provider: 'auto',
  textModel: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  visionModel: 'meta/llama-3.2-90b-vision-instruct',
};

export function buildAiRequestHeaders({ geminiApiKey, nvidiaApiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const geminiKey = String(geminiApiKey || '').trim();
  const nvidiaKey = String(nvidiaApiKey || '').trim();
  if (geminiKey) headers['x-gemini-api-key'] = geminiKey;
  if (nvidiaKey) headers['x-nvidia-api-key'] = nvidiaKey;
  return headers;
}

export function buildAiRequestBody(config = {}, overrides = {}) {
  return {
    aiProvider: config.provider || DEFAULT_AI_PROVIDER_CONFIG.provider,
    textModel: config.textModel || DEFAULT_AI_PROVIDER_CONFIG.textModel,
    visionModel: config.visionModel || DEFAULT_AI_PROVIDER_CONFIG.visionModel,
    ...overrides,
  };
}

export function getModelDisplayName(model) {
  const value = String(model || '').trim();
  if (!value) return '';
  const found = [...AI_TEXT_MODEL_OPTIONS, ...AI_VISION_MODEL_OPTIONS]
    .find((item) => item.value === value);
  return found ? `${found.provider} · ${found.label}` : value;
}

export function getProviderDisplayName(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'nvidia') return 'NVIDIA';
  if (value === 'gemini') return 'Gemini';
  if (value === 'auto') return '自动';
  return provider || '';
}

export function compactAiUsageLabel(label = '') {
  return String(label || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^([^/·]+?)\s*\/\s*\1\s*·\s*/i, '$1 · ');
}

export function getAiUsageLabel(meta = {}) {
  const provider = getProviderDisplayName(meta.provider);
  const model = getModelDisplayName(meta.model_used || meta.model || meta.modelUsed);
  if (provider && model) {
    const label = model.toLowerCase().startsWith(provider.toLowerCase())
      ? model
      : `${provider} / ${model}`;
    return compactAiUsageLabel(label);
  }
  return compactAiUsageLabel(model || provider || '');
}
