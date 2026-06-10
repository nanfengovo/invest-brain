# InvestBrain - AI 决策辅助后端 (Streamlit 版)

专为部署至 **Streamlit Community Cloud (share.streamlit.io)** 量身定制的 `last30days-skill` UI 封装。

## 🚀 免费一键部署指南

1. **推送到 GitHub**:
   将当前文件夹（`last30days-api-deployment`）下的所有文件推送到您的 GitHub 个人仓库中。

2. **登录 Streamlit**:
   访问 [share.streamlit.io](https://share.streamlit.io/) 并使用 GitHub 登录。

3. **新建应用 (New App)**:
   - **Repository**: 选择您刚刚推送的仓库。
   - **Branch**: `main`
   - **Main file path**: `app.py`
   - 点击 **Deploy!**

4. **配置环境变量 (Secrets)**:
   - 在部署页面的右侧，点击 `⋮` -> **Settings** -> **Secrets**。
   - 在里面填入大模型的 API Key，例如：
     ```toml
     GEMINI_API_KEY = "你的_API_KEY"
     GEMINI_REPORT_MODELS = "gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3.5-flash,gemini-3-flash,gemini-2.5-flash"
     ```
   - 点击 Save 保存。

   `GEMINI_REPORT_MODELS` 可选，但建议配置。Google AI Studio 的同一个 API Key 可以调用多个可用模型；这里会按顺序尝试，遇到 429/503 会自动切到下一个模型。日常使用建议把 RPD 更高的 Lite 模型放前面，把质量更强但 RPD 较低的 Flash 模型放后面。

## ⏰ 云端价格提醒定时器

这个 Streamlit 应用可以顺带启动 InvestBrain 的云端价格提醒检查器。开启后，只要 Streamlit 进程在运行，它会按间隔调用移动端项目里的 `/api/alerts-cron`，让价格提醒在浏览器关闭后也能通过飞书或邮件继续发送。

在 Streamlit Secrets 中加入：

```toml
ENABLE_PRICE_ALERT_SCHEDULER = "true"
ALERTS_CRON_URL = "https://invest-brain.vercel.app/api/alerts-cron"
ALERTS_CRON_INTERVAL_SECONDS = "300"

# 如果 Vercel 上配置了 CRON_SECRET，这里也填同一个值
CRON_SECRET = ""
```

也可以独立运行脚本：

```bash
python price_alert_scheduler.py --interval-seconds 300
```

运行一次检查并退出：

```bash
python price_alert_scheduler.py --once
```

## 📈 长桥 Python SDK 期权报价桥

如果 Vercel 端的长桥 HTTP 方式拿不到某些期权实时价，可以把这里作为补充报价桥。它使用长桥官方 Python SDK 的 `option_quote` 能力，移动端在“行情数据源与价格提醒”里填入桥地址后，会优先请求 SDK，再回退到原有数据源。

Streamlit Community Cloud 里可打开兼容调试入口查看 SDK 返回内容：

```text
https://your-app-name.streamlit.app/?api=option_quote
```

但 Streamlit 本质是 UI 运行时，Vercel 自动补价更建议使用标准 Python Web 服务的 WSGI 入口 `option_quote_api:app`，请求示例：

```bash
curl "https://your-python-host/option-quote?symbols=AAPL260618C00100000.US" \
  -H "Authorization: Bearer your_bridge_token"
```

Streamlit Secrets 需要加入：

```toml
LONGPORT_APP_KEY = "你的长桥 App Key"
LONGPORT_APP_SECRET = "你的长桥 App Secret"
LONGPORT_ACCESS_TOKEN = "你的长桥 Access Token"

# 可选；配置后前端也要填同一个 SDK 桥访问 Token
LONGBRIDGE_OPTION_BRIDGE_TOKEN = "your_bridge_token"
```

注意：美股期权实时价仍需要长桥 OpenAPI 的 OPRA US Options Quotes 权限。App/PC 客户端能看到行情，不一定代表 OpenAPI 已开通同一权限。

## 🔌 如何在移动端配合使用？

系统部署成功后，你会得到一个专属的 URL（例如 `https://your-app-name.streamlit.app`）。

在您的 React 移动端源码中，找到 `src/pages/StockDetailPage.jsx`。
找到按钮 `<button className="ai-btn">生成分析报告</button>`。
将它的点击事件修改为打开您部署的网址，例如：

```javascript
<button 
  className="ai-btn" 
  onClick={() => window.open(`https://your-app-name.streamlit.app/?q=${symbol}`, '_blank')}
>
  生成深度 AI 简报
</button>
```

前端点击按钮时，就会新开一个极具极客风格的 Streamlit 黑客面板，为您展示该股票的全网抓取动画并呈现大模型生成的报告！
