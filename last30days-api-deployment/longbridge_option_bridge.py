import json
import os
from datetime import date, datetime
from decimal import Decimal


def get_env_value(*names):
    for name in names:
        value = os.environ.get(name)
        if value:
            return str(value).strip()
    return ""


def get_bridge_token():
    return get_env_value("LONGBRIDGE_OPTION_BRIDGE_TOKEN", "IB_OPTION_BRIDGE_TOKEN")


def is_authorized(token=""):
    expected = get_bridge_token()
    if not expected:
        return True
    return str(token or "").strip() == expected


def split_symbols(value):
    if isinstance(value, (list, tuple)):
        values = value
    else:
        values = str(value or "").replace("\n", ",").split(",")
    return [str(item).strip().upper() for item in values if str(item).strip()]


def to_jsonable(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if hasattr(value, "to_dict"):
        return to_jsonable(value.to_dict())
    if hasattr(value, "__dict__"):
        return {
            key: to_jsonable(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return value


def build_config():
    try:
        from longport.openapi import Config
    except Exception as exc:
        raise RuntimeError("未安装 longport，请在 requirements.txt 中确认 longport 已安装。") from exc

    aliases = {
        "LONGPORT_APP_KEY": get_env_value("LONGPORT_APP_KEY", "LONGBRIDGE_APP_KEY"),
        "LONGPORT_APP_SECRET": get_env_value("LONGPORT_APP_SECRET", "LONGBRIDGE_APP_SECRET"),
        "LONGPORT_ACCESS_TOKEN": get_env_value("LONGPORT_ACCESS_TOKEN", "LONGBRIDGE_ACCESS_TOKEN"),
    }
    for key, value in aliases.items():
        if value:
            os.environ[key] = value

    try:
        return Config.from_env()
    except Exception as exc:
        raise RuntimeError("长桥 SDK 凭证缺失，请配置 LONGPORT_APP_KEY、LONGPORT_APP_SECRET、LONGPORT_ACCESS_TOKEN。") from exc


def normalize_option_quote(row):
    raw = to_jsonable(row) or {}
    extend = raw.get("option_extend") or raw.get("optionExtend") or {}
    symbol = raw.get("symbol") or extend.get("symbol")
    last_done = raw.get("last_done", raw.get("lastDone"))
    prev_close = raw.get("prev_close", raw.get("prevClose"))
    return {
        "symbol": symbol,
        "last_done": last_done,
        "prev_close": prev_close,
        "open": raw.get("open"),
        "high": raw.get("high"),
        "low": raw.get("low"),
        "timestamp": raw.get("timestamp"),
        "volume": raw.get("volume"),
        "turnover": raw.get("turnover"),
        "trade_status": raw.get("trade_status", raw.get("tradeStatus")),
        "option_extend": extend,
        "provider": "Longbridge Python SDK",
        "raw": raw,
    }


def fetch_option_quotes(symbols):
    normalized_symbols = split_symbols(symbols)
    if not normalized_symbols:
        return {
            "success": False,
            "error": "缺少 symbols 参数。",
            "quotes": [],
        }
    if len(normalized_symbols) > 500:
        return {
            "success": False,
            "error": "长桥单次最多查询 500 个期权合约。",
            "quotes": [],
        }

    try:
        from longport.openapi import QuoteContext
    except Exception as exc:
        raise RuntimeError("未安装 longport，请在 requirements.txt 中确认 longport 已安装。") from exc

    ctx = QuoteContext(build_config())
    response = ctx.option_quote(normalized_symbols)
    rows = response if isinstance(response, list) else list(response or [])
    return {
        "success": True,
        "provider": "Longbridge Python SDK",
        "symbols": normalized_symbols,
        "quotes": [normalize_option_quote(row) for row in rows],
        "count": len(rows),
    }


def build_option_quote_payload(symbols, token=""):
    if not is_authorized(token):
        return {
            "success": False,
            "error": "长桥期权报价桥 Token 不正确。",
            "quotes": [],
        }

    try:
        return fetch_option_quotes(symbols)
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc) or "长桥 SDK 期权报价失败。",
            "quotes": [],
        }


def dumps_payload(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
