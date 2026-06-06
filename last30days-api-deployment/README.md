# InvestBrain - AI 决策辅助后端

这是一个轻量级的 Python FastAPI 接口，专用于在云端运行 `last30days-skill` 爬虫大模型引擎，并为您的 InvestBrain 移动端提供舆情分析接口。

## 🚀 部署指南 (Streamlit / Hugging Face / Render)

由于 Vercel 的环境限制，我们将此模块独立部署。推荐部署到完全免费的平台。

### 选项 1: 部署到 Render (最推荐, 支持 Node 和 Python)
1. 将此文件夹上传到您的 GitHub。
2. 注册并登录 [Render.com](https://render.com)。
3. 点击 **New -> Web Service**，连接您的 GitHub 仓库。
4. **Environment**: `Python 3`
5. **Build Command**: `pip install -r requirements.txt && npm install -g npx` (注意: Render 默认环境可能需要安装 Node)
6. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. **Environment Variables**: 添加您的 API Keys，如 `GEMINI_API_KEY` 或 `ANTHROPIC_API_KEY`。

### 选项 2: 部署到 Hugging Face Spaces
1. 注册并登录 [Hugging Face](https://huggingface.co/spaces)。
2. 创建一个新的 Space，SDK 选择 **Docker**。
3. 将此文件夹的代码上传。
4. 您需要在文件夹中添加一个简单的 `Dockerfile`：
   ```dockerfile
   FROM python:3.11
   RUN apt-get update && apt-get install -y nodejs npm
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
   ```
5. 在 Space 的 Settings 中配置 Secrets (API Keys)。

## 🔌 接口测试
部署成功后，测试您的接口：
`https://<your-domain>/api/research?q=AAPL`
