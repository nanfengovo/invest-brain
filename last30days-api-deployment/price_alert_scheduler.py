import argparse
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


DEFAULT_ALERTS_CRON_URL = "https://invest-brain.vercel.app/api/alerts-cron"
DEFAULT_INTERVAL_SECONDS = 300
MIN_INTERVAL_SECONDS = 60


@dataclass(frozen=True)
class SchedulerConfig:
    url: str = DEFAULT_ALERTS_CRON_URL
    interval_seconds: int = DEFAULT_INTERVAL_SECONDS
    cron_secret: str = ""
    enabled: bool = False
    run_once_on_start: bool = True


def parse_bool(value, default=False):
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def parse_interval_seconds(value, default=DEFAULT_INTERVAL_SECONDS):
    try:
        seconds = int(float(value))
    except (TypeError, ValueError):
        seconds = default
    return max(MIN_INTERVAL_SECONDS, seconds)


def config_from_env(env=None):
    env = env or os.environ
    return SchedulerConfig(
        url=str(env.get("ALERTS_CRON_URL") or DEFAULT_ALERTS_CRON_URL).strip(),
        interval_seconds=parse_interval_seconds(env.get("ALERTS_CRON_INTERVAL_SECONDS")),
        cron_secret=str(env.get("CRON_SECRET") or "").strip(),
        enabled=parse_bool(env.get("ENABLE_PRICE_ALERT_SCHEDULER"), False),
        run_once_on_start=parse_bool(env.get("PRICE_ALERT_RUN_ON_START"), True),
    )


def trigger_alert_check(config):
    headers = {"User-Agent": "InvestBrain-Streamlit-AlertScheduler/1.0"}
    if config.cron_secret:
        headers["Authorization"] = f"Bearer {config.cron_secret}"

    request = urllib.request.Request(config.url, headers=headers, method="GET")
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"raw": raw}


def run_scheduler(config=None, stop_event=None, logger=None):
    config = config or config_from_env()
    stop_event = stop_event or threading.Event()
    logger = logger or logging.getLogger(__name__)

    if not config.enabled:
        logger.info("Price alert scheduler is disabled.")
        return

    logger.info(
        "Price alert scheduler started: url=%s interval=%ss",
        config.url,
        config.interval_seconds,
    )

    first_run = True
    while not stop_event.is_set():
        if first_run and not config.run_once_on_start:
            first_run = False
        else:
            started_at = time.time()
            try:
                result = trigger_alert_check(config)
                logger.info("Price alert check finished: %s", result)
            except urllib.error.HTTPError as exc:
                logger.warning("Price alert check HTTP %s: %s", exc.code, exc.reason)
            except Exception as exc:
                logger.warning("Price alert check failed: %s", exc)
            elapsed = time.time() - started_at
            first_run = False
            logger.debug("Price alert check elapsed %.2fs", elapsed)

        stop_event.wait(config.interval_seconds)


def start_background_scheduler(config=None, logger=None):
    config = config or config_from_env()
    logger = logger or logging.getLogger(__name__)

    if not config.enabled:
        return None

    if getattr(start_background_scheduler, "_thread", None):
        thread = start_background_scheduler._thread
        if thread.is_alive():
            return thread

    stop_event = threading.Event()
    thread = threading.Thread(
        target=run_scheduler,
        kwargs={"config": config, "stop_event": stop_event, "logger": logger},
        name="investbrain-price-alert-scheduler",
        daemon=True,
    )
    thread.stop_event = stop_event
    thread.start()
    start_background_scheduler._thread = thread
    return thread


def main():
    parser = argparse.ArgumentParser(description="InvestBrain cloud price alert scheduler")
    parser.add_argument("--url", default=os.environ.get("ALERTS_CRON_URL", DEFAULT_ALERTS_CRON_URL))
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=parse_interval_seconds(os.environ.get("ALERTS_CRON_INTERVAL_SECONDS")),
    )
    parser.add_argument("--secret", default=os.environ.get("CRON_SECRET", ""))
    parser.add_argument("--once", action="store_true", help="run one check and exit")
    parser.add_argument("--log-level", default=os.environ.get("PRICE_ALERT_LOG_LEVEL", "INFO"))
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    config = SchedulerConfig(
        url=args.url,
        interval_seconds=parse_interval_seconds(args.interval_seconds),
        cron_secret=args.secret,
        enabled=True,
        run_once_on_start=True,
    )

    if args.once:
        print(json.dumps(trigger_alert_check(config), ensure_ascii=False))
        return

    run_scheduler(config)


if __name__ == "__main__":
    main()
