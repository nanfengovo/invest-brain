const ALLOWED_MODELS = [
  'pollinations-flux',
  'pollinations-turbo',
  'qwen-image',
  'qwen-image-2512',
  'flux.2-klein-4b',
  'flux.1-schnell',
  'stabilityai/stable-diffusion-3.5-large',
];

const MODEL_ENDPOINTS = {
  'qwen-image': {
    model: 'qwen-image',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/qwen/qwen-image',
    family: 'qwen',
  },
  'qwen/qwen-image': {
    model: 'qwen-image',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/qwen/qwen-image',
    family: 'qwen',
  },
  'flux.1-schnell': {
    model: 'flux.1-schnell',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
    family: 'flux1',
  },
  'black-forest-labs/flux.1-schnell': {
    model: 'flux.1-schnell',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
    family: 'flux1',
  },
  'flux.2-klein-4b': {
    model: 'flux.2-klein-4b',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
    family: 'flux2',
  },
  'black-forest-labs/flux.2-klein-4b': {
    model: 'flux.2-klein-4b',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
    family: 'flux2',
  },
  'stabilityai/stable-diffusion-3.5-large': {
    model: 'stabilityai/stable-diffusion-3.5-large',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3.5-large',
    family: 'sd35',
  },
  'stable-diffusion-3.5-large': {
    model: 'stabilityai/stable-diffusion-3.5-large',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3.5-large',
    family: 'sd35',
  },
};

const DEFAULT_MODEL = 'pollinations-flux';
const DEFAULT_NVIDIA_MODEL = 'qwen-image';
const DEFAULT_POLLINATIONS_MODEL = 'pollinations-flux';
const FALLBACK_MODELS = [
  'qwen-image',
  'qwen-image-2512',
  'flux.2-klein-4b',
  'flux.1-schnell',
  'stabilityai/stable-diffusion-3.5-large',
];
const NIM_SIZE_STEPS = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
const QWEN_SIZE_STEPS = Array.from({ length: 73 }, (_, index) => 512 + index * 16);
const FLUX2_SIZE_STEPS = Array.from({ length: 67 }, (_, index) => 512 + index * 16);
const DEFAULT_OPENAI_IMAGE_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const POLLINATIONS_IMAGE_BASE_URL = 'https://image.pollinations.ai/prompt';

function nearestSize(value, fallback, steps = NIM_SIZE_STEPS) {
  const numeric = Number(value) || fallback;
  return steps.reduce((best, item) => (
    Math.abs(item - numeric) < Math.abs(best - numeric) ? item : best
  ), steps[0]);
}

function normalizeModel(model) {
  const value = String(model || '').trim();
  if (MODEL_ENDPOINTS[value]) return MODEL_ENDPOINTS[value].model;
  if (ALLOWED_MODELS.includes(value) && !value.startsWith('pollinations-')) return value;
  return DEFAULT_NVIDIA_MODEL;
}

function normalizePollinationsModel(model) {
  const value = String(model || '').trim().toLowerCase();
  if (['pollinations-turbo', 'turbo'].includes(value)) return 'pollinations-turbo';
  return DEFAULT_POLLINATIONS_MODEL;
}

function modelToPollinationsParam(model) {
  return normalizePollinationsModel(model).replace(/^pollinations-/, '');
}

function normalizeProvider(provider, requestedModel) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'pollinations') return 'pollinations';
  if (String(requestedModel || '').toLowerCase().startsWith('pollinations-')) return 'pollinations';
  if (!value && !String(requestedModel || '').trim()) return 'pollinations';
  return 'nvidia';
}

function buildSeed(...parts) {
  const input = parts.map((part) => String(part || '')).join('|');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647;
}

function getAttemptModels(requestedModel) {
  const first = normalizeModel(requestedModel);
  return [first, ...FALLBACK_MODELS].filter((model, index, list) => (
    model && list.indexOf(model) === index
  ));
}

function getResponseError(payload, status) {
  return payload?.error?.message || payload?.error || `NVIDIA 图像接口请求失败（HTTP ${status}）`;
}

async function readJsonResponse(response) {
  const responseText = await response.text();
  return responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return { error: responseText };
    }
  })() : {};
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

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(getResponseError(payload, response.status));
    error.status = response.status;
    error.model = model;
    throw error;
  }
  return payload;
}

async function callDirectModelEndpoint({ apiKey, model, prompt, width, height, seed }) {
  const endpointConfig = MODEL_ENDPOINTS[model];
  if (!endpointConfig) {
    throw new Error(`NVIDIA 模型未配置直接端点：${model}`);
  }

  const body = buildDirectModelBody({
    family: endpointConfig.family,
    prompt,
    width,
    height,
    seed,
  });

  const response = await fetch(endpointConfig.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(getResponseError(payload, response.status));
    error.status = response.status;
    error.model = endpointConfig.model;
    throw error;
  }
  return payload;
}

function buildDirectModelBody({ family, prompt, width, height, seed }) {
  const safeSeed = Number.isFinite(Number(seed)) ? Number(seed) : buildSeed(prompt, family, width, height, Date.now());
  if (family === 'qwen') {
    return {
      prompt,
      width: nearestSize(width, 1088, QWEN_SIZE_STEPS),
      height: nearestSize(height, 1440, QWEN_SIZE_STEPS),
      samples: 1,
      seed: safeSeed,
      steps: 30,
      cfg_scale: 4,
      negative_prompt: 'text, numbers, logo, watermark, blurry, low quality',
    };
  }

  if (family === 'flux2') {
    return {
      prompt,
      mode: 'Image Generation',
      width: nearestSize(width, 1088, FLUX2_SIZE_STEPS),
      height: nearestSize(height, 1440, FLUX2_SIZE_STEPS),
      samples: 1,
      seed: safeSeed,
      steps: 4,
      cfg_scale: 1,
    };
  }

  if (family === 'sd35') {
    return {
      prompt,
      mode: 'base',
      width: nearestSize(width, 1088),
      height: nearestSize(height, 1344),
      samples: 1,
      seed: safeSeed,
      steps: 40,
      cfg_scale: 3.5,
    };
  }

  return {
    prompt,
    mode: 'base',
    width: nearestSize(width, 1024),
    height: nearestSize(height, 1344),
    samples: 1,
    seed: safeSeed,
    steps: 4,
    cfg_scale: 0,
  };
}

async function callPollinationsImageApi({ prompt, model, width, height, seed }) {
  const url = new URL(`${POLLINATIONS_IMAGE_BASE_URL}/${encodeURIComponent(prompt)}`);
  url.searchParams.set('model', modelToPollinationsParam(model));
  url.searchParams.set('width', String(Math.min(1280, Math.max(512, Math.round(width)))));
  url.searchParams.set('height', String(Math.min(1280, Math.max(512, Math.round(height)))));
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('enhance', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'image/png,image/jpeg,image/webp,application/json',
    },
  });
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    let message = `Pollinations 图像接口请求失败（HTTP ${response.status}）`;
    if (/json/i.test(contentType)) {
      try {
        const payload = JSON.parse(bytes.toString('utf8'));
        message = payload?.error || payload?.message || message;
      } catch {
        // Keep the HTTP status fallback.
      }
    }
    const error = new Error(message);
    error.status = response.status;
    error.model = normalizePollinationsModel(model);
    throw error;
  }

  if (/json/i.test(contentType)) {
    const payload = JSON.parse(bytes.toString('utf8') || '{}');
    const image = await normalizeImageValue(payload.image || payload.url || payload.data?.[0]?.url);
    if (!image) throw Object.assign(new Error('Pollinations 返回中未找到图片数据'), { status: 502, model });
    return image;
  }

  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

function shouldTryNextModel(error) {
  const status = Number(error?.status);
  if (!Number.isFinite(status)) return true;
  return [400, 404, 422, 429, 500, 502, 503, 504].includes(status);
}

export async function generateShareBackground({
  apiKey,
  prompt,
  provider,
  requestedModel,
  requestedWidth = 1080,
  requestedHeight = 1440,
  requestedSeed,
}) {
  const safePrompt = String(prompt || '').trim();
  if (!safePrompt) {
    throw new Error('请先输入背景提示词');
  }

  const width = Math.min(1536, Math.max(512, Number(requestedWidth) || 1080));
  const height = Math.min(1536, Math.max(512, Number(requestedHeight) || 1440));
  const selectedProvider = normalizeProvider(provider, requestedModel);
  const seed = Number.isFinite(Number(requestedSeed))
    ? Number(requestedSeed)
    : buildSeed(safePrompt, requestedModel, width, height, Date.now());
  if (selectedProvider === 'pollinations') {
    const model = normalizePollinationsModel(requestedModel);
    const image = await callPollinationsImageApi({
      prompt: safePrompt,
      model,
      width,
      height,
      seed,
    });
    return {
      image,
      model,
      provider: 'pollinations',
      seed,
      fallbackModelsTried: [],
      note: 'Pollinations 当前可能有队列/限流；若失败，请稍后重试或切换其他模型源。',
    };
  }

  if (!apiKey) {
    throw new Error('NVIDIA API Key 未配置，请先在设置页或环境变量中添加。');
  }

  const errors = [];

  for (const model of getAttemptModels(requestedModel)) {
    const calls = model === 'qwen-image' || model === 'qwen-image-2512' || model === 'flux.2-klein-4b'
      ? [
          () => callOpenAiCompatibleImageApi({ apiKey, model, prompt: safePrompt, width, height }),
          ...(MODEL_ENDPOINTS[model] ? [() => callDirectModelEndpoint({ apiKey, model, prompt: safePrompt, width, height, seed })] : []),
        ]
      : [() => callDirectModelEndpoint({ apiKey, model, prompt: safePrompt, width, height, seed })];

    for (const call of calls) {
      try {
        const payload = await call();
        const image = await extractImageFromNvidiaPayload(payload);

        if (!image) {
          throw Object.assign(new Error('NVIDIA 返回中未找到图片数据'), { status: 502, model });
        }

        return {
          image,
          model,
          provider: 'nvidia',
          seed,
          fallbackModelsTried: errors.map((item) => item.model).filter(Boolean),
        };
      } catch (error) {
        errors.push({
          model,
          message: error.message || '未知错误',
          status: error.status || null,
        });
        if (!shouldTryNextModel(error)) {
          throw error;
        }
      }
    }
  }

  const summary = errors
    .map((item) => `${item.model}${item.status ? ` HTTP ${item.status}` : ''}: ${item.message}`)
    .join('；');
  throw new Error(summary || 'NVIDIA 图像模型均生成失败');
}
