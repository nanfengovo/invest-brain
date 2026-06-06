export const config = {
  maxDuration: 20,
};

function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

async function sendFeishu(webhook, title, body) {
  if (!webhook) return { skipped: true };
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: `${title}\n${body}`.trim(),
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Feishu webhook responded with ${response.status}: ${text.slice(0, 120)}`);
  }
  return { ok: true };
}

async function sendResendEmail(email, title, body) {
  if (!email?.apiKey || !email?.from || !email?.to) return { skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${email.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: email.from,
      to: String(email.to).split(/[,\n，、]/).map((item) => item.trim()).filter(Boolean),
      subject: title,
      text: body,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Resend responded with ${response.status}: ${text.slice(0, 120)}`);
  }
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    const title = cleanText(payload.title || 'InvestBrain 价格提醒', 160);
    const body = cleanText(payload.body || payload.message || '', 2000);
    const channels = Array.isArray(payload.channels) ? payload.channels : ['email', 'feishu'];
    const result = {};

    if (!body) {
      return res.status(400).json({ error: 'Missing notification body' });
    }

    if (channels.includes('feishu')) {
      result.feishu = await sendFeishu(payload.feishuWebhook, title, body);
    }

    if (channels.includes('email')) {
      result.email = await sendResendEmail(payload.email, title, body);
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Notify Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
