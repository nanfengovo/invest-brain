import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data } = req.body;
    
    // Check local API key header first, fallback to env variable
    const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: '请在设置页面配置 Gemini API Key' });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({ error: '没有足够的数据进行分析' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const prompt = `你是一位华尔街资深的量化分析师和交易教练。
我将提供给你一个交易员最近一段时间的“决策与复盘闭环数据”。每一条记录都包含了他买入/卖出时的【原始决策逻辑】以及平仓后的【复盘反思】。
请你以极其专业、客观、甚至有些冷酷的视角，分析他的交易性格、知行合一程度以及核心缺陷。

【交易记录数据 (JSON格式)】
${JSON.stringify(data.slice(0, 20), null, 2)}

请你严格按照以下 JSON 格式输出分析报告（不要输出任何多余的 Markdown 标记或文字，只输出合法的 JSON 对象）：
{
  "personality": "简短的性格标签（例如：激进摸底型、保守右侧型、情绪化赌徒等）",
  "radarData": {
    "execution": 0,    // 执行力 (0-100)：决策和复盘的行动是否一致
    "emotion": 0,      // 情绪控制 (0-100)：是否容易追涨杀跌
    "winRate": 0,      // 胜率 (0-100)：客观评估
    "riskReward": 0,   // 盈亏比认知 (0-100)：是否懂得截断亏损让利润奔跑
    "focus": 0,        // 专注度 (0-100)：板块是否过于分散
    "cognition": 0     // 认知深度 (0-100)：复盘是否有深度，还是只怪运气
  },
  "analysis": "一段 100 字左右的深度点评，直击痛点。分析其“知行合一”的程度，以及连败/连胜中的共性模式。",
  "advice": [
    "建议1（具体可操作的，如：不要在财报前重仓）",
    "建议2",
    "建议3"
  ]
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean up potential markdown formatting from Gemini's response
    let jsonStr = responseText;
    if (jsonStr.startsWith('\`\`\`json')) {
      jsonStr = jsonStr.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (jsonStr.startsWith('\`\`\`')) {
      jsonStr = jsonStr.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const parsedData = JSON.parse(jsonStr);

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('AI Insight Error:', error);
    res.status(500).json({ error: error.message || 'AI 分析失败' });
  }
}
