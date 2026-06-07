import os
import sys
import unittest


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STREAMLIT_DIR = os.path.join(ROOT, "last30days-api-deployment")
sys.path.insert(0, STREAMLIT_DIR)

from price_alert_scheduler import (  # noqa: E402
    DEFAULT_ALERTS_CRON_URL,
    config_from_env,
    parse_bool,
    parse_interval_seconds,
)


class PriceAlertSchedulerTest(unittest.TestCase):
    def test_parse_bool(self):
        self.assertTrue(parse_bool("true"))
        self.assertTrue(parse_bool("1"))
        self.assertFalse(parse_bool("false"))
        self.assertFalse(parse_bool("0"))
        self.assertTrue(parse_bool("unknown", True))

    def test_interval_has_minimum(self):
        self.assertEqual(parse_interval_seconds("10"), 60)
        self.assertEqual(parse_interval_seconds("300"), 300)
        self.assertEqual(parse_interval_seconds("bad"), 300)

    def test_config_from_env(self):
        config = config_from_env({
            "ENABLE_PRICE_ALERT_SCHEDULER": "true",
            "ALERTS_CRON_URL": "https://example.com/api/alerts-cron",
            "ALERTS_CRON_INTERVAL_SECONDS": "600",
            "CRON_SECRET": "secret",
            "PRICE_ALERT_RUN_ON_START": "false",
        })

        self.assertTrue(config.enabled)
        self.assertEqual(config.url, "https://example.com/api/alerts-cron")
        self.assertEqual(config.interval_seconds, 600)
        self.assertEqual(config.cron_secret, "secret")
        self.assertFalse(config.run_once_on_start)

    def test_default_config_is_disabled(self):
        config = config_from_env({})

        self.assertFalse(config.enabled)
        self.assertEqual(config.url, DEFAULT_ALERTS_CRON_URL)
        self.assertEqual(config.interval_seconds, 300)


if __name__ == "__main__":
    unittest.main()
