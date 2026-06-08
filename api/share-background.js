/**
 * Vercel Serverless Function — /api/share-background
 *
 * Generates optional poster backgrounds through NVIDIA Build / NIM.
 * Critical trading text and numbers are still rendered locally by Canvas.
 */

export const config = {
  maxDuration: 60,
};

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

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `NVIDIA API ${response.status}`);
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

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `NVIDIA API ${response.status}`);
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-nvidia-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  try {
    const apiKey = req.headers['x-nvidia-api-key'] || process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'NVIDIA API Key 未配置，请先在设置页或环境变量中添加。' });
    }

    const {
      prompt,
      model: requestedModel,
      width: requestedWidth = 1080,
      height: requestedHeight = 1440,
    } = req.body || {};

    const safePrompt = String(prompt || '').trim();
    if (!safePrompt) {
      return res.status(400).json({ error: '请先输入背景提示词' });
    }

    const model = normalizeModel(requestedModel);
    const width = Math.min(1536, Math.max(512, Number(requestedWidth) || 1080));
    const height = Math.min(1536, Math.max(512, Number(requestedHeight) || 1440));
    const payload = MODEL_ENDPOINTS[model]
      ? await callDirectModelEndpoint({ apiKey, model, prompt: safePrompt, width, height })
      : await callOpenAiCompatibleImageApi({ apiKey, model, prompt: safePrompt, width, height });
    const image = await extractImageFromNvidiaPayload(payload);

    if (!image) {
      return res.status(502).json({ error: 'NVIDIA 返回中未找到图片数据', model });
    }

    return res.status(200).json({
      image,
      model,
      provider: 'nvidia',
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'AI 背景生成失败',
    });
  }
}
