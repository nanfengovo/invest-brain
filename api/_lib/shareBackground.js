const ALLOWED_MODELS = [
  'qwen-image-2512',
  'qwen-image',
  'flux.2-klein-4b',
  'stabilityai/stable-diffusion-3.5-large',
];

const MODEL_ENDPOINTS = {
  'flux.1-schnell': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
  'black-forest-labs/flux.1-schnell': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
  'flux.2-klein-4b': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
  'black-forest-labs/flux.2-klein-4b': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
};

const DEFAULT_MODEL = 'qwen-image-2512';
const NIM_SIZE_STEPS = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
const DEFAULT_OPENAI_IMAGE_BASE_URL = 'https://integrate.api.nvidia.com/v1';

function nearestNimSize(value, fallback) {
  const numeric = Number(value) || fallback;
  return NIM_SIZE_STEPS.reduce((best, item) => (
    Math.abs(item - numeric) < Math.abs(best - numeric) ? item : best
  ), NIM_SIZE_STEPS[0]);
}

function normalizeModel(model) {
  const value = String(model || '').trim();
  return ALLOWED_MODELS.includes(value) || MODEL_ENDPOINTS[value] ? value : DEFAULT_MODEL;
}

async function normalizeImageValue(value) {
  if (!value) return null;
  const direct = String(value);
  if (direct.startsWith('data:image/')) return direct;
  if (/^https?:\/\//i.test(direct)) {
    const response = await fetch(direct);
    if (!response.ok) {
      throw new Error(`图片下载失败 ${response.status}`);
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  }
  return `data:image/png;base64,${direct}`;
}

async function extractImageFromNvidiaPayload(payload) {
  const direct =
    payload?.image ||
    payload?.b64_json ||
    payload?.artifacts?.[0]?.base64 ||
    payload?.artifacts?.[0]?.url ||
    payload?.data?.[0]?.b64_json ||
    payload?.data?.[0]?.base64 ||
    payload?.data?.[0]?.url ||
    payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url ||
    payload?.choices?.[0]?.message?.images?.[0]?.url;

  if (!direct) return null;
  return normalizeImageValue(direct);
}

async function callOpenAiCompatibleImageApi({ apiKey, model, prompt, width, height }) {
  const baseUrl = String(process.env.NVIDIA_IMAGE_BASE_URL || DEFAULT_OPENAI_IMAGE_BASE_URL)
    .replace(/\/+$/g, '');
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: `${width}x${height}`,
      response_format: 'b64_json',
    }),
  });

  const responseText = await response.text();
  const payload = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return { error: responseText };
    }
  })() : {};
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `NVIDIA 图像接口请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

async function callDirectModelEndpoint({ apiKey, model, prompt, width, height }) {
  const isFlux2 = model.includes('flux.2');
  const body = {
    prompt,
    mode: isFlux2 ? 'Image Generation' : 'base',
    width: nearestNimSize(width, 1024),
    height: nearestNimSize(height, 1344),
    samples: 1,
    seed: 0,
  };
  if (isFlux2) body.steps = 4;

  const response = await fetch(MODEL_ENDPOINTS[model], {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  const payload = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return { error: responseText };
    }
  })() : {};
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `NVIDIA 图像接口请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

export async function generateShareBackground({ apiKey, prompt, requestedModel, requestedWidth = 1080, requestedHeight = 1440 }) {
  if (!apiKey) {
    throw new Error('NVIDIA API Key 未配置，请先在设置页或环境变量中添加。');
  }

  const safePrompt = String(prompt || '').trim();
  if (!safePrompt) {
    throw new Error('请先输入背景提示词');
  }

  const model = normalizeModel(requestedModel);
  const width = Math.min(1536, Math.max(512, Number(requestedWidth) || 1080));
  const height = Math.min(1536, Math.max(512, Number(requestedHeight) || 1440));
  const payload = MODEL_ENDPOINTS[model]
    ? await callDirectModelEndpoint({ apiKey, model, prompt: safePrompt, width, height })
    : await callOpenAiCompatibleImageApi({ apiKey, model, prompt: safePrompt, width, height });
  const image = await extractImageFromNvidiaPayload(payload);

  if (!image) {
    throw new Error('NVIDIA 返回中未找到图片数据');
  }

  return {
    image,
    model,
    provider: 'nvidia',
  };
}
