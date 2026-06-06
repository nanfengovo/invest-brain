import streamlit as st
import subprocess
import os
import shutil
import time

# --- 页面配置 ---
st.set_page_config(page_title="InvestBrain AI 舆情", page_icon="🧠", layout="centered")

# --- 自定义样式 (匹配手机端暗黑模式) ---
st.markdown("""
<style>
    body {
        background-color: #0a0e17;
        color: #e8ecf1;
    }
    .stApp {
        background-color: #0a0e17;
    }
    /* 隐藏 Streamlit 右上角的菜单和底部的 footer */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
</style>
""", unsafe_allow_html=True)

# 获取 URL 参数 (Streamlit 1.30+ 用法)
query_params = st.query_params
target_symbol = query_params.get("q", "")

st.title("🧠 InvestBrain 全景舆情")

if not target_symbol:
    st.info("请在 InvestBrain 移动端中点击股票进行分析。")
    st.stop()

st.subheader(f"正在深度解析: {target_symbol.upper()}")

def build_last30days_command(query):
    npx_path = shutil.which("npx")
    if npx_path:
        return [
            npx_path, "-y", "skills", "run", "mvanhorn/last30days-skill",
            "--query", query,
            "--format", "markdown"
        ]

    npm_path = shutil.which("npm")
    if npm_path:
        return [
            npm_path, "exec", "--yes", "--package=skills", "--",
            "skills", "run", "mvanhorn/last30days-skill",
            "--query", query,
            "--format", "markdown"
        ]

    return None

# 检查依赖环境
if not build_last30days_command(target_symbol):
    st.error("❌ 严重错误: 环境中未找到 Node.js/npm。请将 `packages.txt` 放在 Streamlit Cloud 绑定仓库的根目录，并确保内容包含 `nodejs` 和 `npm`。")
    st.stop()

# 检查 API Key 是否存在 (可以在 Streamlit Cloud 的 Secrets 中配置)
# if "GEMINI_API_KEY" not in os.environ and "GEMINI_API_KEY" not in st.secrets:
#     st.warning("⚠️ 未检测到 API Key，请在 Streamlit Secrets 中配置大模型密钥！")

@st.cache_data(ttl=3600)  # 缓存 1 小时，避免重复消耗 Token
def run_last30days(query):
    command = build_last30days_command(query)
    if not command:
        return "### ❌ 环境错误\n\n未找到 Node.js/npm，无法运行 last30days-skill。"
    
    # 注入 Secrets 到环境变量中 (如果使用了 Streamlit Secrets)
    env = os.environ.copy()
    if hasattr(st, "secrets"):
        for k, v in st.secrets.items():
            env[k] = str(v)

    try:
        # 启动子进程，设置超时时间为 120 秒
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            env=env,
            timeout=120
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return f"### ❌ 分析失败\n\n**错误信息**:\n```\n{e.stderr}\n```"
    except subprocess.TimeoutExpired:
        return "### ⏱️ 请求超时\n\n抓取全网数据耗时过长，请稍后再试。"
    except Exception as e:
        return f"### ⚠️ 系统错误\n\n```\n{str(e)}\n```"

with st.spinner(f"正在全网拉取 {target_symbol.upper()} 近 30 天的 Reddit / Twitter / YouTube 讨论与情感数据，这可能需要 30-60 秒..."):
    # 模拟一些友好的加载提示
    progress_bar = st.progress(0)
    for percent_complete in range(100):
        time.sleep(0.05)
        progress_bar.progress(percent_complete + 1)
        if percent_complete == 30:
            st.toast("正在提取 Reddit 热点...")
        elif percent_complete == 60:
            st.toast("正在分析 X (Twitter) 情绪...")
        elif percent_complete == 90:
            st.toast("大模型正在生成研究简报...")
    
    # 真正执行 Python 脚本
    markdown_result = run_last30days(target_symbol)
    progress_bar.empty()

# 渲染最终结果
st.markdown("---")
st.markdown(markdown_result)
