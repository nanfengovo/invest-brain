from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import os
import shutil

app = FastAPI(title="InvestBrain Last30Days API")

# 允许跨域请求，以便你的 Vercel 前端可以直接访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "message": "Last30Days API is running. Use /api/research?q=AAPL"}

@app.get("/api/research")
async def research(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
    
    # 检查环境中是否安装了 npx 和 node
    if not shutil.which("npx"):
        raise HTTPException(status_code=500, detail="npx command not found. Node.js is required.")

    # 构建并运行命令
    # 注意：这里会使用环境变量中的 API Key，比如 GEMINI_API_KEY
    command = [
        "npx", "-y", "skills", "run", "mvanhorn/last30days-skill",
        "--query", q,
        "--format", "markdown"
    ]
    
    try:
        # 执行命令，捕获输出
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            # 将系统的环境变量传给子进程，这样它能读取到你的 LLM Keys
            env=os.environ.copy()
        )
        
        # 返回标准的 Markdown 结果
        return {
            "success": True,
            "query": q,
            "markdown": result.stdout
        }
        
    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "error": "Failed to run last30days-skill",
            "details": e.stderr
        }
