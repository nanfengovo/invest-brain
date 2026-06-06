# InvestBrain (投资大脑) 🧠📈

InvestBrain 是一个面向个人投资者的**投资决策闭环系统**。它的目标不是单纯记录买卖流水，而是把主观、冲动、容易被情绪劫持的投资行为，强行转化为一套**数据可追踪、逻辑可溯源、结果可复盘**的标准化流程。

系统基于 PWA 架构运行，核心数据优先存储在本地 OPFS SQLite 中，适合把手机当成随身投资工作台：收集情报、沉淀观点、制定计划、执行交易、复盘结果，都在同一个闭环里完成。

---

## 核心理念：投资决策闭环

InvestBrain 的核心逻辑是 Investment Decision Closed-Loop：每一笔交易都应该能回答三个问题。

- **为什么做？** 交易来自哪条情报、哪个观点、哪份决策计划。
- **怎么做？** 建仓、加仓、止盈、止损、仓位和风险边界是否提前写清楚。
- **做得怎样？** 最终盈亏能不能反向归因到信息质量、判断质量和执行纪律。

它不是一个鼓励“今天感觉不错就买一点”的工具，而是一个投资纪律约束系统：先形成逻辑，再允许执行；先留下证据，再进入复盘。

## 正向推导漏斗

业务流从发散到收敛分为四层：

1. **情报 (Information)**
   市场新闻、研报、财报、推文、视频、异动信号都先进入情报层。URL 会通过 AI 辅助提取正文和中文标题，避免只保存一个无法复盘的链接。

2. **观点 (Viewpoints)**
   对情报做主观解读，例如“业绩压力已经被市场消化”“AI CapEx 可能继续上修”“监管风险高于预期”。观点是情报和交易计划之间的推理层。

3. **决策 (Decisions)**
   把观点转成可执行计划，记录标的、方向、信心、情绪倾向、目标仓位、止盈止损和观察条件。决策是从“我觉得”进入“我准备怎么做”的关键节点。

4. **交易 (Trades)**
   实际买入、卖出、开仓、平仓。交易应尽量关联到决策；没有决策支撑的交易会成为后续纪律检查和复盘的重点。

## 反向约束机制

闭环的价值不在于“多记几个字段”，而在于反向监督。

- **游离交易识别**：交易表保留 `decision_id`，用于区分有计划交易和无决策交易。无决策交易不是系统鼓励的快捷入口，而是纪律复盘时必须解释的异常信号。
- **状态生命周期**：情报有待处理/归档状态，观点有活跃状态，决策有执行中/关闭状态，复盘会把决策推进到闭环状态，避免只买不卖、只看不复盘。
- **证据链追踪**：`decision_info_links` 把决策和情报建立多对多关系，`reviews` 绑定决策结果，盈亏可以向上追溯到当初的判断依据。

## 复盘反馈

交易周期结束后，系统通过复盘把结果反馈给认知模型。

- 如果亏损来自错误情报，下一次要提高信息源质量。
- 如果亏损来自判断失误，下一次要修正观点生成方式。
- 如果亏损来自没有按计划执行，下一次要收紧交易纪律。
- 如果盈利来自好运而非计划，也需要在复盘中标记，避免把随机收益误认成能力。

---

## 主要功能

- **本地优先的数据安全策略**：使用 SQLite3 WASM + OPFS，交易、笔记、附件优先留在浏览器本地，降低中心化泄露风险。
- **AI 情报提炼**：`/api/summarize` 会优先使用 Jina Reader 把 URL 转成 LLM 友好的 Markdown，再通过 Gemini 模型池生成中文标题和摘要。
- **舆情研究入口**：`last30days-api-deployment` 封装 last30days-skill，用于按标的拉取最近 30 天 Reddit / Hacker News / Polymarket / Web 讨论，并生成中文研究简报。
- **美股数据证据快照**：股票详情页会基于 Yahoo Chart 数据生成趋势、波动、回撤、52 周位置和量能指标，可一键复制为决策证据。
- **闭环数据模型**：情报、观点、决策、交易、复盘都有独立表结构和关联字段，支持从结果反查原因。
- **PWA 移动体验**：支持添加到手机桌面，保留移动端手势、暗色界面和离线优先体验。
- **富媒体留存**：支持图片/视频附件上传，支持 YouTube、Bilibili、X/Twitter 等外部内容的辅助留存。

---

## 🛠 技术栈

- **前端框架**: React 18 + Vite
- **UI 组件库**: Ant Design Mobile v5
- **状态管理**: Zustand
- **本地数据库**: SQLite3 (WASM) + OPFS (Origin Private File System)
- **后端/API**: Vercel Serverless Functions (Node.js)
- **路由**: React Router
- **部署**: Vercel

---

## 🚀 如何在本地运行

### 环境要求
- Node.js (建议 v18+)
- npm 或 pnpm

### 1. 克隆代码
```bash
git clone https://github.com/nanfengovo/invest-brain.git
cd invest-brain
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
在项目根目录创建一个 `.env` 文件，并填入你的大模型 API Key（目前用于智能提炼功能）：
```env
# Gemini API Key (推荐)
GEMINI_API_KEY=your_gemini_api_key_here

# URL 情报卡片总结模型池 (可选，按顺序自动兜底)
GEMINI_SUMMARY_MODELS=gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3.5-flash,gemini-3-flash,gemini-2.5-flash

# 备用大语言模型配置 (可选)
OPENROUTER_API_KEY=your_openrouter_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
```

### 4. 启动本地开发服务器
```bash
npm run dev
```
运行后，在浏览器中打开命令行提示的本地地址（通常是 `http://localhost:5173` 或 `http://localhost:5174`）。

> **💡 开发提示**:
> 由于应用依赖 OPFS 本地文件系统，本地测试时请尽量使用 Chrome 或 Edge 的最新版本。如果使用网络 IP（如 `http://192.168.x.x`）在手机上预览，确保环境是在 HTTPS 下，或者将其配置为 Secure Context，否则 OPFS 可能会被浏览器禁用。

### 5. 运行测试闭环
```bash
npm run verify
```

该命令会先运行 `node --test tests/closed-loop-schema.test.js`，验证情报、观点、决策、交易、复盘的数据库契约仍然存在，再执行一次 `vite build` 确认前端可以完整打包。这里直接调用 `vite build`，不会触发 `npm run build` 的版本号自增钩子。

### 6. 打包生产版本
```bash
npm run build
```
生成的文件将位于 `dist/` 目录中。

---

## 🤝 贡献与二次开发

该项目极度解耦且采用本地数据库，非常适合个人在此基础上进行二次开发和定制：
- **数据库表结构**: 位于 `src/db/migrations.js`。若需新增表或字段，只需增加 `version` 并在数组末尾添加新的 SQL 语句即可完成自动迁移。
- **闭环测试契约**: 位于 `tests/closed-loop-schema.test.js`。修改情报、观点、决策、交易、复盘关系时，先更新测试再调整迁移。
- **页面入口**: 位于 `src/App.jsx`。
- **API 代理**: 位于 `api/` 目录下（Vercel 部署环境适用）。

---

## 📜 开源协议

MIT License
