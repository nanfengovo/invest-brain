import streamlit as st
import json
import re
import subprocess
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from html import escape
from pathlib import Path
from price_alert_scheduler import config_from_env, start_background_scheduler

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
    .ib-language-pill {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        margin: -18px 0 30px;
        padding: 0 12px;
        border: 1px solid rgba(103, 243, 214, 0.18);
        border-radius: 999px;
        background: rgba(103, 243, 214, 0.08);
        color: #9df8e5;
        font-size: 14px;
        font-weight: 700;
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

def get_query_param(name, default=""):
    value = st.query_params.get(name, default)
    if isinstance(value, list):
        return value[0] if value else default
    return value or default


def get_secret_value(*names):
    for name in names:
        value = os.environ.get(name)
        if value:
            return str(value)

        try:
            if hasattr(st, "secrets") and name in st.secrets:
                return str(st.secrets[name])
        except Exception:
            continue

    return ""


def load_streamlit_secrets_into_env():
    if not hasattr(st, "secrets"):
        return

    for key in (
        "ENABLE_PRICE_ALERT_SCHEDULER",
        "ALERTS_CRON_URL",
        "ALERTS_CRON_INTERVAL_SECONDS",
        "CRON_SECRET",
        "PRICE_ALERT_RUN_ON_START",
        "PRICE_ALERT_LOG_LEVEL",
    ):
        try:
            if key in st.secrets:
                os.environ[key] = str(st.secrets[key])
        except Exception:
            continue


@st.cache_resource(show_spinner=False)
def ensure_price_alert_scheduler():
    load_streamlit_secrets_into_env()
    config = config_from_env()
    thread = start_background_scheduler(config)
    return {
        "enabled": config.enabled,
        "url": config.url,
        "interval_seconds": config.interval_seconds,
        "running": bool(thread and thread.is_alive()),
    }


ensure_price_alert_scheduler()


# 获取 URL 参数 (Streamlit 1.30+ 用法)
target_symbol = get_query_param("q", "")
report_language = get_query_param("lang", "zh").lower()
use_chinese_report = report_language in ("zh", "zh-cn", "cn", "chinese")

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

if use_chinese_report:
    st.markdown('<div class="ib-language-pill">中文研究简报模式</div>', unsafe_allow_html=True)

SKILL_REPO_URL = "https://github.com/mvanhorn/last30days-skill.git"
DEFAULT_SKILL_ROOT = Path(os.environ.get("LAST30DAYS_SKILL_ROOT", "/tmp/last30days-skill"))
SCRIPT_RELATIVE_PATH = Path("skills/last30days/scripts/last30days.py")
DEFAULT_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash",
]
MAX_GEMINI_INPUT_CHARS = 36000


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


def unique_values(values):
    seen = set()
    result = []
    for value in values:
        value = str(value or "").strip()
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def split_csv_models(value):
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def get_gemini_model_pool():
    configured = []
    for secret_name in ("GEMINI_REPORT_MODELS", "GEMINI_MODELS", "GEMINI_MODEL"):
        configured.extend(split_csv_models(get_secret_value(secret_name)))
    return unique_values([*configured, *DEFAULT_GEMINI_MODELS])


def truncate_text(text, limit):
    text = str(text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n\n[内容已截断，保留最相关的前半部分供模型生成中文简报。]"


def post_gemini_request(api_key, model, prompt, max_output_tokens=4096):
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_output_tokens,
        },
    }

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=55) as response:
        response_data = json.loads(response.read().decode("utf-8"))

    parts = (
        response_data
        .get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    return "\n".join(part.get("text", "") for part in parts).strip()


def call_gemini_for_chinese_report(raw_markdown, query):
    api_key = get_secret_value("GEMINI_API_KEY", "GOOGLE_API_KEY")
    if not api_key:
        return None, "未配置 GEMINI_API_KEY。"

    model_pool = get_gemini_model_pool()
    prompt = f"""
你是 InvestBrain 的中文投资研究助手。请把下面的 last30days 原始研究结果整理成中文 Markdown 简报。

要求：
1. 全文使用简体中文，股票代码、公司名、平台名、专有名词可保留英文。
2. 不要编造原始材料中没有的事实、数字、链接或来源。
3. 保留重要来源链接、日期、平台名称和不确定性提示。
4. 输出结构固定为：
   - ### 核心结论
   - ### 最近 30 天情绪
   - ### 关键证据
   - ### 风险与催化
   - ### 跟踪清单
5. 如果原始材料不足，明确写出“证据不足”，不要强行给确定结论。
6. 如果原始材料主要是英文，你必须用中文总结其含义，不要把英文长段落原样搬进正文。
7. 每条关键证据尽量包含来源平台、日期、链接和一句中文解释。

研究对象：{query}

原始结果：
{truncate_text(raw_markdown, MAX_GEMINI_INPUT_CHARS)}
""".strip()

    last_error = None
    for model in model_pool:
        for attempt in range(2):
            try:
                text = post_gemini_request(api_key, model, prompt)
                if text:
                    return text, None
                last_error = f"{model}: Gemini 未返回可用中文内容。"
                break
            except urllib.error.HTTPError as exc:
                last_error = f"{model}: Gemini API 返回 {exc.code}"
                if exc.code in (429, 503) and attempt == 0:
                    time.sleep(1.2)
                    continue
                break
            except Exception as exc:
                last_error = f"{model}: {exc}"
                break

    return None, last_error or "全部 Gemini 模型均不可用。"


def clean_markdown_inline(text):
    return re.sub(r"\s+", " ", str(text or "").replace("**", "").replace("__", "")).strip()


def extract_first_match(pattern, text, default="暂未识别"):
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return default
    return match.group(1).strip()


def extract_ranked_evidence(raw_markdown, limit=8):
    evidence_block = raw_markdown
    envelope = re.search(
        r"<!-- EVIDENCE FOR SYNTHESIS.*?-->([\s\S]*?)<!-- END EVIDENCE FOR SYNTHESIS -->",
        raw_markdown,
        flags=re.IGNORECASE,
    )
    if envelope:
        evidence_block = envelope.group(1)

    items = []
    current = None
    current_cluster = ""

    for line in evidence_block.splitlines():
        cluster_match = re.match(r"^###\s+\d+\.\s+(.+?)\s+\(score\s+[^)]*\)", line.strip())
        if cluster_match:
            current_cluster = clean_markdown_inline(cluster_match.group(1))
            continue

        item_match = re.match(r"^\d+\.\s+\[([^\]]+)\]\s+(.+)$", line.strip())
        if item_match:
            if current:
                items.append(current)
                if len(items) >= limit:
                    break
            current = {
                "source": clean_markdown_inline(item_match.group(1)),
                "title": clean_markdown_inline(item_match.group(2)),
                "cluster": current_cluster,
                "date": "",
                "url": "",
                "why": "",
                "evidence": "",
            }
            continue

        if not current:
            continue

        detail_match = re.match(r"^\s+-\s+(.+)$", line)
        if not detail_match:
            continue

        detail = detail_match.group(1).strip()
        if detail.startswith("URL:"):
            current["url"] = detail.replace("URL:", "", 1).strip()
        elif detail.startswith("Why:"):
            current["why"] = clean_markdown_inline(detail.replace("Why:", "", 1))
        elif detail.startswith("Evidence:"):
            current["evidence"] = clean_markdown_inline(detail.replace("Evidence:", "", 1))
        elif not current["date"] and re.search(r"\d{4}-\d{2}-\d{2}|date unknown", detail, flags=re.IGNORECASE):
            current["date"] = clean_markdown_inline(detail.split("|")[0])

    if current and len(items) < limit:
        items.append(current)

    return items


def score_keyword_sentiment(raw_markdown):
    text = raw_markdown.lower()
    positive_words = [
        "bullish", "beat", "growth", "strong", "upgrade", "optimism", "rally",
        "momentum", "record", "demand", "raise", "upside", "positive", "buy",
        "long", "outperform", "surge", "accelerate",
    ]
    negative_words = [
        "bearish", "miss", "lawsuit", "risk", "concern", "weak", "downgrade",
        "crash", "cut", "pressure", "decline", "fall", "recession", "tariff",
        "antitrust", "slowdown", "negative", "sell", "short", "underperform",
    ]
    positive = sum(text.count(word) for word in positive_words)
    negative = sum(text.count(word) for word in negative_words)
    if positive >= negative * 1.4 and positive >= 2:
        label = "偏正面"
    elif negative >= positive * 1.4 and negative >= 2:
        label = "偏负面"
    elif positive or negative:
        label = "分歧较大"
    else:
        label = "证据不足"
    return label, positive, negative


def source_summary_from_items(items):
    counts = {}
    for item in items:
        source = item.get("source") or "未知来源"
        counts[source] = counts.get(source, 0) + 1
    if not counts:
        return "暂未识别"
    return "、".join(f"{source} {count} 条" for source, count in sorted(counts.items()))


def build_evidence_bullets(items):
    if not items:
        return "- 暂未从原始结果中抽取到可读证据条目，请展开下方原始英文证据人工核对。"

    bullets = []
    for item in items[:6]:
        date = item.get("date") or "日期未明"
        source = item.get("source") or "未知来源"
        title = item.get("title") or item.get("cluster") or "未命名证据"
        url = item.get("url")
        evidence = item.get("evidence") or item.get("why") or ""
        line = f"- **{title}**（{source}，{date}）"
        if evidence:
            line += f"：{evidence[:220]}"
        if url:
            line += f" [原文]({url})"
        bullets.append(line)
    return "\n".join(bullets)


def build_basic_chinese_report(raw_markdown, query, reason):
    safe_query = re.sub(r"\s+", " ", query.upper()).strip()[:80] or "当前标的"
    date_range = extract_first_match(r"Date range:\s*([^\n]+)", raw_markdown)
    sources = extract_first_match(r"Sources:\s*([^\n]+)", raw_markdown)
    evidence_items = extract_ranked_evidence(raw_markdown)
    sentiment_label, positive_hits, negative_hits = score_keyword_sentiment(raw_markdown)
    extracted_sources = source_summary_from_items(evidence_items)
    reason_text = reason or "中文增强服务暂不可用"

    return f"""
### 核心结论

已完成 **{safe_query}** 最近 30 天的舆情检索。中文增强模型暂未成功返回：**{reason_text}**。系统已切换为本地结构化摘要模式，以下结论只基于 last30days 抓取结果中的标题、来源、日期、链接和摘录做整理。

### 最近 30 天情绪

- 日期范围：{date_range}
- 数据来源：{sources}
- 可读证据来源分布：{extracted_sources}
- 关键词情绪：**{sentiment_label}**（正向词 {positive_hits} 次，负向词 {negative_hits} 次）。这是本地规则判断，不等同于模型深度研判。

### 关键证据

{build_evidence_bullets(evidence_items)}

### 风险与催化

- 当前中文报告不是逐句翻译，英文原文仍需展开核对，尤其要检查标题党、断章取义和来源偏差。
- 如果证据集中在单一平台，情绪代表性会偏弱。
- 舆情只能提示市场关注点，交易前仍需结合实时行情、财报、公告、期权/成交量和仓位纪律。

### 跟踪清单

- 优先复核上方关键证据对应的原文链接，确认发布时间和上下文。
- 如果经常触发 429，请把 `GEMINI_REPORT_MODELS` 设置为高 RPD 模型优先，例如 `gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-3.5-flash`。
- 若需要更高质量中文研报，可在额度充足时把 `gemini-3.5-flash` 或 `gemini-2.5-flash` 放到模型池前面。
""".strip()


def localize_report(raw_markdown, query, language):
    if language not in ("zh", "zh-cn", "cn", "chinese"):
        return raw_markdown, None

    localized, error = call_gemini_for_chinese_report(raw_markdown, query)
    if localized:
        return localized, None

    return build_basic_chinese_report(raw_markdown, query, error), error


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
    raw_markdown_result = markdown_result
    progress_bar.empty()

# 渲染最终结果
localization_error = None
if use_chinese_report:
    with st.spinner("正在生成中文研究简报..."):
        markdown_result, localization_error = localize_report(raw_markdown_result, target_symbol, report_language)
    if localization_error:
        st.warning("中文增强服务暂不可用，已切换基础中文摘要。原始英文证据已折叠保留。")

st.markdown("---")
st.markdown(markdown_result)

if use_chinese_report and localization_error:
    with st.expander("查看 last30days 原始英文证据"):
        st.markdown(raw_markdown_result)
