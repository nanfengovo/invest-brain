# InvestBrain (投资大脑) 🧠📈

InvestBrain 是一个专为个人投资者设计的**逻辑驱动型**投资管理工具。它不仅仅是一个记账软件，而是一个致力于帮助你将“情绪化交易”转化为“逻辑化交易”的闭环系统。

该系统基于 PWA（渐进式 Web 应用）架构，数据优先存储于本地（OPFS SQLite），保证极高的隐私性和离线可用性，同时拥有类似原生 App 的流畅交互。

---

## 🌟 核心理念与工作流

InvestBrain 的核心工作流围绕以下五个环节展开，强制你为每一次交易建立逻辑支撑：

1. **📥 收集情报 (Information)**
   - 看到一篇财报、一条推文或一个视频，觉得它可能会影响某只股票。
   - 输入 URL，系统内置的 AI（如 Gemini）会自动总结标题并提取正文内容。
   - **收件箱模式**：定期清理和消化你的情报，避免信息焦虑。

2. **💡 产生观点 (Viewpoints)**
   - 针对收集到的情报，写下你的主观解读（例如：“利空出尽，可能是买入机会”）。

3. **🎯 制定决策 (Decisions)**
   - 将观点沉淀为具体的投资决策（例如：“准备建仓 AAPL”）。
   - 定义该决策的信心指数和情绪倾向（多/空/观望），进入**观望**状态。

4. **⚡ 交易执行 (Trades)**
   - 实际买入或卖出股票/期权。每一笔交易都必须（或建议）关联到之前制定的“决策”上，做到“知行合一”。

5. **🔍 结果复盘 (Reviews)**
   - 交易完成后，关闭决策并进行复盘：这笔交易逻辑是否正确？赚/亏了多少？学到了什么？

---

## ✨ 主要功能特性

- **数据本地优先安全策略**：使用 WASM 版本的 SQLite3 和 OPFS（源私有文件系统），所有交易数据、笔记、截屏图片都原原本本地保存在你的浏览器/手机本地，绝对不经过中心化服务器，**100% 保护你的财务隐私**。
- **AI 智能助手集成**：内置 Vercel Serverless Function 代理的 AI 接口（支持多个大模型 fallback），可以自动通过社交媒体链接（如 X/Twitter）提取正文并总结情报标题。
- **PWA 原生体验**：支持添加到手机桌面（Add to Home Screen）。拥有沉浸式的暗黑玻璃拟物 (Glassmorphism) UI，支持手势滑动删除 (SwipeAction) 和触觉反馈。
- **富媒体留存**：支持本地图片/视频附件上传；支持 YouTube、Bilibili 视频链接自动渲染播放器；支持 X/Twitter 推文离线文本提取。

---

## 🛠 技术栈

- **前端框架**: React 18 + Vite
- **UI 组件库**: Ant Design Mobile v5
- **状态管理**: Zustand
- **本地数据库**: SQLite3 (WASM) + OPFS (Origin Private File System)
- **后端/API**: Vercel Serverless Functions (Node.js)
- **路由**: React Router v6
- **部署**: Vercel

---

## 🚀 如何在本地运行

### 环境要求
- Node.js (建议 v18+)
- npm 或 pnpm

### 1. 克隆代码
\`\`\`bash
git clone https://github.com/nanfengovo/invest-brain.git
cd invest-brain
\`\`\`

### 2. 安装依赖
\`\`\`bash
npm install
\`\`\`

### 3. 配置环境变量
在项目根目录创建一个 \`.env\` 文件，并填入你的大模型 API Key（目前用于智能提炼功能）：
\`\`\`env
# Gemini API Key (推荐)
GEMINI_API_KEY=your_gemini_api_key_here

# 备用大语言模型配置 (可选)
OPENROUTER_API_KEY=your_openrouter_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
\`\`\`

### 4. 启动本地开发服务器
\`\`\`bash
npm run dev
\`\`\`
运行后，在浏览器中打开命令行提示的本地地址（通常是 \`http://localhost:5173\` 或 \`http://localhost:5174\`）。

> **💡 开发提示**:
> 由于应用依赖 OPFS 本地文件系统，本地测试时请尽量使用 Chrome 或 Edge 的最新版本。如果使用网络 IP（如 \`http://192.168.x.x\`）在手机上预览，确保环境是在 HTTPS 下，或者将其配置为 Secure Context，否则 OPFS 可能会被浏览器禁用。

### 5. 打包生产版本
\`\`\`bash
npm run build
\`\`\`
生成的文件将位于 \`dist/\` 目录中。

---

## 🤝 贡献与二次开发

该项目极度解耦且采用本地数据库，非常适合个人在此基础上进行二次开发和定制：
- **数据库表结构**: 位于 \`src/db/migrations.js\`。若需新增表或字段，只需增加 \`version\` 并在数组末尾添加新的 SQL 语句即可完成自动迁移。
- **页面入口**: 位于 \`src/App.jsx\`。
- **API 代理**: 位于 \`api/\` 目录下（Vercel 部署环境适用）。

---

## 📜 开源协议

MIT License
