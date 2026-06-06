import streamlit as st
import subprocess
import os
import shutil
import sys
import time
from html import escape
from pathlib import Path

# --- 页面配置 ---
st.set_page_config(page_title="InvestBrain AI 舆情", page_icon="🤖", layout="centered")

AGENT_LOGO_SVG = """
<svg viewBox="0 0 48 48" role="img" aria-label="智能体" xmlns="http://www.w3.org/2000/svg">
  <path class="ib-agent-logo-halo" d="M24 4 40.45 13.5v19L24 42 7.55 32.5v-19L24 4Z" />
  <path class="ib-agent-logo-shell" d="M24 7.8 37.16 15.4v15.2L24 38.2 10.84 30.6V15.4L24 7.8Z" />
  <path class="ib-agent-logo-face" d="M16 20.2c0-3.2 2.6-5.8 5.8-5.8h4.4c3.2 0 5.8 2.6 5.8 5.8v4.9c0 3.2-2.6 5.8-5.8 5.8h-4.4c-3.2 0-5.8-2.6-5.8-5.8v-4.9Z" />
  <path class="ib-agent-logo-line" d="M24 10.8v4.2M17.6 33.3l3-3M30.4 33.3l-3-3" />
  <circle class="ib-agent-logo-eye" cx="21" cy="22.7" r="1.7" />
  <circle class="ib-agent-logo-eye" cx="29" cy="22.7" r="1.7" />
  <path class="ib-agent-logo-mouth" d="M21.5 27c1.8 1.3 4.2 1.3 6 0" />
  <circle class="ib-agent-logo-node" cx="24" cy="10.8" r="2.2" />
</svg>
"""

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
    .block-container {
        max-width: 760px;
        padding-top: 56px;
        padding-right: 28px;
        padding-left: 28px;
    }
    .ib-hero {
        display: flex;
        align-items: center;
        gap: 18px;
        margin: 0 0 34px;
    }
    .ib-agent-logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 62px;
        height: 62px;
        border: 1px solid rgba(113, 166, 255, 0.28);
        border-radius: 20px;
        background:
            radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.2), transparent 28%),
            linear-gradient(145deg, rgba(52, 86, 160, 0.42), rgba(17, 24, 40, 0.88));
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            0 0 26px rgba(68, 136, 255, 0.22),
            0 14px 34px rgba(0, 0, 0, 0.32);
    }
    .ib-agent-logo svg {
        width: 46px;
        height: 46px;
        overflow: visible;
    }
    .ib-agent-logo-halo {
        fill: rgba(49, 211, 184, 0.1);
        stroke: rgba(91, 149, 255, 0.48);
        stroke-width: 1.4;
    }
    .ib-agent-logo-shell {
        fill: rgba(11, 19, 33, 0.92);
        stroke: rgba(141, 183, 255, 0.62);
        stroke-width: 1.4;
    }
    .ib-agent-logo-face {
        fill: rgba(92, 124, 255, 0.18);
        stroke: rgba(222, 238, 255, 0.78);
        stroke-width: 1.3;
    }
    .ib-agent-logo-line,
    .ib-agent-logo-mouth {
        fill: none;
        stroke: #67f3d6;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.7;
    }
    .ib-agent-logo-eye,
    .ib-agent-logo-node {
        fill: #7df5dc;
        filter: drop-shadow(0 0 5px rgba(103, 243, 214, 0.72));
    }
    .ib-title {
        min-width: 0;
        color: #f8fbff;
        font-size: clamp(34px, 7vw, 58px);
        font-weight: 850;
        line-height: 1.08;
        letter-spacing: 0;
    }
    .ib-subtitle {
        margin: 0 0 34px;
        color: #f8fbff;
        font-size: clamp(26px, 5.4vw, 44px);
        font-weight: 820;
        line-height: 1.16;
        letter-spacing: 0;
    }
    /* 隐藏 Streamlit 右上角的菜单和底部的 footer */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    @media (max-width: 520px) {
        .block-container {
            padding-top: 42px;
            padding-right: 22px;
            padding-left: 22px;
        }
        .ib-hero {
            gap: 12px;
            margin-bottom: 28px;
        }
        .ib-agent-logo {
            width: 52px;
            height: 52px;
            border-radius: 18px;
        }
        .ib-agent-logo svg {
            width: 40px;
            height: 40px;
        }
        .ib-title {
            font-size: 34px;
        }
        .ib-subtitle {
            font-size: 28px;
        }
    }
</style>
""", unsafe_allow_html=True)

# 获取 URL 参数 (Streamlit 1.30+ 用法)
query_params = st.query_params
target_symbol = query_params.get("q", "")

st.markdown(
    f"""
    <div class="ib-hero">
      <div class="ib-agent-logo">{AGENT_LOGO_SVG}</div>
      <div class="ib-title">InvestBrain 全景舆情</div>
    </div>
    """,
    unsafe_allow_html=True,
)

if not target_symbol:
    st.info("请在 InvestBrain 移动端中点击股票进行分析。")
    st.stop()

display_symbol = escape(target_symbol.upper())

st.markdown(
    f'<div class="ib-subtitle">正在深度解析: {display_symbol}</div>',
    unsafe_allow_html=True,
)

SKILL_REPO_URL = "https://github.com/mvanhorn/last30days-skill.git"
DEFAULT_SKILL_ROOT = Path(os.environ.get("LAST30DAYS_SKILL_ROOT", "/tmp/last30days-skill"))
SCRIPT_RELATIVE_PATH = Path("skills/last30days/scripts/last30days.py")


def is_python_supported():
    return sys.version_info >= (3, 12)


@st.cache_resource(show_spinner=False)
def ensure_last30days_checkout():
    configured_script = os.environ.get("LAST30DAYS_SCRIPT_PATH")
    if configured_script:
        script_path = Path(configured_script).expanduser().resolve()
        if script_path.exists():
            return script_path

    script_path = DEFAULT_SKILL_ROOT / SCRIPT_RELATIVE_PATH
    if script_path.exists():
        return script_path

    DEFAULT_SKILL_ROOT.parent.mkdir(parents=True, exist_ok=True)

    if DEFAULT_SKILL_ROOT.exists():
        shutil.rmtree(DEFAULT_SKILL_ROOT)

    git_path = shutil.which("git")
    if not git_path:
        raise RuntimeError("环境中未找到 git，无法自动拉取 last30days-skill。")

    subprocess.run(
        [git_path, "clone", "--depth", "1", SKILL_REPO_URL, str(DEFAULT_SKILL_ROOT)],
        capture_output=True,
        text=True,
        check=True,
        timeout=90,
    )

    if not script_path.exists():
        raise RuntimeError(f"未找到 last30days.py: {script_path}")

    return script_path


def build_last30days_command(query):
    script_path = ensure_last30days_checkout()
    return [
        sys.executable,
        str(script_path),
        query,
        "--emit=compact",
        "--quick",
        "--search=reddit,hackernews,polymarket,grounding",
        "--web-backend=auto",
    ]


if not is_python_supported():
    st.error(
        "❌ Streamlit Python 版本过低。last30days-skill 需要 Python 3.12+；"
        f"当前环境是 Python {sys.version_info.major}.{sys.version_info.minor}。"
        "请确认仓库中已包含 `runtime.txt`，内容为 `python-3.12`，然后重启 Streamlit 应用。"
    )
    st.stop()

# 检查 API Key 是否存在 (可以在 Streamlit Cloud 的 Secrets 中配置)
# if "GEMINI_API_KEY" not in os.environ and "GEMINI_API_KEY" not in st.secrets:
#     st.warning("⚠️ 未检测到 API Key，请在 Streamlit Secrets 中配置大模型密钥！")

@st.cache_data(ttl=3600)  # 缓存 1 小时，避免重复消耗 Token
def run_last30days(query):
    # 注入 Secrets 到环境变量中 (如果使用了 Streamlit Secrets)
    env = os.environ.copy()
    if hasattr(st, "secrets"):
        for k, v in st.secrets.items():
            env[k] = str(v)

    try:
        command = build_last30days_command(query)
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            env=env,
            timeout=150
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()
        stdout = (e.stdout or "").strip()
        details = stderr or stdout or "last30days-skill 未返回错误详情。"
        return f"### ❌ 分析失败\n\n**错误信息**:\n```\n{details}\n```"
    except subprocess.TimeoutExpired:
        return "### ⏱️ 请求超时\n\n抓取全网数据耗时过长，请稍后再试。"
    except Exception as e:
        return f"### ⚠️ 系统错误\n\n```\n{str(e)}\n```"

with st.spinner(f"正在全网拉取 {target_symbol.upper()} 近 30 天的 Reddit / Hacker News / Polymarket / Web 讨论与市场信号，这可能需要 30-60 秒..."):
    # 模拟一些友好的加载提示
    progress_bar = st.progress(0)
    for percent_complete in range(100):
        time.sleep(0.05)
        progress_bar.progress(percent_complete + 1)
        if percent_complete == 30:
            st.toast("正在提取 Reddit 热点...")
        elif percent_complete == 60:
            st.toast("正在聚合 Hacker News 与 Polymarket 信号...")
        elif percent_complete == 90:
            st.toast("正在生成研究简报...")
    
    # 真正执行 Python 脚本
    markdown_result = run_last30days(target_symbol)
    progress_bar.empty()

# 渲染最终结果
st.markdown("---")
st.markdown(markdown_result)
