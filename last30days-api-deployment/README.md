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
     ```
   - 点击 Save 保存。

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
