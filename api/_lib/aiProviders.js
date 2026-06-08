export const GEMINI_TEXT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-1.5-pro',
];

export const GEMINI_VISION_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
];

export const NVIDIA_TEXT_MODELS = [
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.2-3b-instruct',
  'mistralai/mistral-small-4-119b-2603',
  'google/gemma-4-31b-it',
  'minimaxai/minimax-m2.7',
  'deepseek-ai/deepseek-r1',
  'qwen/qwen3-next-80b-a3b-instruct',
];

export const NVIDIA_VISION_MODELS = [
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'mistralai/mistral-small-4-119b-2603',
];

export const DEFAULT_AI_PROVIDER_CONFIG = {
  provider: 'auto',
  textModel: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  visionModel: 'meta/llama-3.2-90b-vision-instruct',
};

const NVIDIA_CHAT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export function uniqueValues(values) {
  return [...new Set(
    values
      .flatMap(value => String(value || '').split(','))
      .map(value => value.trim())
      .filter(Boolean)
  )];
}

function readHeader(req, name) {
  const headers = req?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

export function getAiKeys(req) {
  return {
    gemini: String(readHeader(req, 'x-gemini-api-key') || process.env.GEMINI_API_KEY || '').trim(),
    nvidia: String(readHeader(req, 'x-nvidia-api-key') || process.env.NVIDIA_API_KEY || '').trim(),
  };
}

export function hasAnyAiKey(keys = {}) {
  return Boolean(keys.gemini || keys.nvidia);
}

export function getProviderForModel(model) {
  const value = String(model || '').trim();
  if (!value) return '';
  if (/^(models\/)?gemini[-/]/i.test(value)) return 'gemini';
  return 'nvidia';
}

export function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return ['gemini', 'nvidia', 'auto'].includes(value) ? value : 'auto';
}

export function getAiModelPool({
  task = 'text',
  provider = 'auto',
  requestedModel = '',
  configuredValues = [],
  keys = {},
} = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const isVisionTask = task === 'vision';
  const geminiDefaults = isVisionTask ? GEMINI_VISION_MODELS : GEMINI_TEXT_MODELS;
  const nvidiaDefaults = isVisionTask ? NVIDIA_VISION_MODELS : NVIDIA_TEXT_MODELS;
  const configured = uniqueValues([requestedModel, ...configuredValues]);

  if (normalizedProvider === 'gemini') {
    return uniqueValues([...configured.filter(model => getProviderForModel(model) === 'gemini'), ...geminiDefaults]);
  }

  if (normalizedProvider === 'nvidia') {
    return uniqueValues([...configured.filter(model => getProviderForModel(model) === 'nvidia'), ...nvidiaDefaults]);
  }

  const configuredModels = configured.length ? configured : [];
  const defaults = [
    ...(keys.nvidia ? nvidiaDefaults : []),
    ...(keys.gemini ? geminiDefaults : []),
    ...nvidiaDefaults,
    ...geminiDefaults,
  ];
  return uniqueValues([...configuredModels, ...defaults]);
}

function normalizeGeminiModel(model) {
  return String(model || '').trim().replace(/^models\//, '');
}

function normalizeDataUrlFromInlineData(inlineData = {}) {
  const mimeType = inlineData.mimeType || 'image/png';
  const data = String(inlineData.data || '').replace(/^data:image\/\w+;base64,/, '');
  return `data:${mimeType};base64,${data}`;
}

function buildNvidiaContent(parts = []) {
  const hasImage = parts.some(part => part?.inlineData);
  if (!hasImage) {
    return parts.map(part => part?.text || '').filter(Boolean).join('\n\n');
  }

  return parts.flatMap((part) => {
    if (part?.text) return [{ type: 'text', text: part.text }];
    if (part?.inlineData) {
      return [{
        type: 'image_url',
        image_url: { url: normalizeDataUrlFromInlineData(part.inlineData) },
      }];
    }
    return [];
  });
}

function extractOpenAiContent(message) {
  const content = message?.content;
  if (Array.isArray(content)) {
    return content
      .map(item => item?.text || item?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return String(content || '').trim();
}

async function callGeminiModel({ apiKey, model, parts, maxOutputTokens, responseMimeType, temperature }) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${normalizeGeminiModel(model)}:generateContent?key=${apiKey}`;
  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType,
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || payload?.error || `Gemini API ${response.status}`), {
      status: response.status,
      payload,
    });
  }

  const rawResponse = (payload.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || '')
    .join('\n')
    .trim();

  if (!rawResponse) {
    throw Object.assign(new Error('Empty Gemini response'), { status: 200, payload });
  }

  return rawResponse;
}

async function callNvidiaModel({ apiKey, model, parts, maxOutputTokens, responseMimeType, temperature }) {
  const baseUrl = String(process.env.NVIDIA_CHAT_BASE_URL || NVIDIA_CHAT_BASE_URL).replace(/\/+$/g, '');
  const body = {
    model,
    messages: [{ role: 'user', content: buildNvidiaContent(parts) }],
    temperature,
    top_p: 0.7,
    max_tokens: maxOutputTokens,
    stream: false,
  };

  if (responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || payload?.error || `NVIDIA API ${response.status}`), {
      status: response.status,
      payload,
    });
  }

  const rawResponse = extractOpenAiContent(payload.choices?.[0]?.message);
  if (!rawResponse) {
    throw Object.assign(new Error('Empty NVIDIA response'), { status: 200, payload });
  }

  return rawResponse;
}

function shouldRetryStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function callAiWithModelPool({
  keys,
  models,
  parts,
  maxOutputTokens = 700,
  responseMimeType = 'application/json',
  temperature = 0.2,
  preferredRetries = 2,
} = {}) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const attemptedModels = [];
  const attemptedModelDetails = [];
  let lastError = null;
  let retryCount = 0;

  for (let index = 0; index < models.length; index += 1) {
    const currentModel = models[index];
    const provider = getProviderForModel(currentModel);
    const apiKey = keys?.[provider];
    if (!apiKey) {
      lastError = { model: currentModel, provider, text: `${provider} API Key missing` };
      continue;
    }

    const maxAttempts = index === 0 ? Math.max(1, preferredRetries) : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      attemptedModels.push(currentModel);
      attemptedModelDetails.push({ provider, model: currentModel });

      try {
        const rawResponse = provider === 'gemini'
          ? await callGeminiModel({ apiKey, model: currentModel, parts, maxOutputTokens, responseMimeType, temperature })
          : await callNvidiaModel({ apiKey, model: currentModel, parts, maxOutputTokens, responseMimeType, temperature });

        return {
          rawResponse,
          provider,
          model: currentModel,
          model_used: currentModel,
          attempted_models: attemptedModels,
          attempted_model_details: attemptedModelDetails,
          retry_count: retryCount,
        };
      } catch (error) {
        lastError = {
          model: currentModel,
          provider,
          status: error.status,
          text: error.message,
        };
        if (attempt < maxAttempts - 1 && shouldRetryStatus(error.status)) {
          retryCount += 1;
          await sleep(1200);
          continue;
        }
        break;
      }
    }
  }

  const details = lastError
    ? `${lastError.provider || 'ai'}/${lastError.model || 'unknown'}: ${lastError.text}`
    : 'No available AI model';
  throw new Error(details);
}

export function parseAiJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new Error('模型没有返回合法 JSON');
  }
  return JSON.parse(objectMatch[0]);
}

export function buildAiMetadata(result, requestedModel = '') {
  return {
    provider: result?.provider || '',
    model: result?.model || '',
    model_used: result?.model_used || result?.model || '',
    requested_model: requestedModel || '',
    fallback_used: Boolean(requestedModel && result?.model && requestedModel !== result.model),
    retry_count: Number(result?.retry_count || 0),
    attempted_models: result?.attempted_models || [],
    attempted_model_details: result?.attempted_model_details || [],
  };
}
