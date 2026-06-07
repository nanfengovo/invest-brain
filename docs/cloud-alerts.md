# Cloud Price Alerts

The app syncs active price alerts to Redis through `/api/alerts-sync`.
`/api/alerts-cron` checks those cloud rules and sends Feishu or email notifications while the browser is closed.

## Scheduler

Vercel Hobby projects only support daily cron jobs, so `vercel.json` keeps a daily fallback schedule:

```json
{ "path": "/api/alerts-cron", "schedule": "0 13 * * *" }
```

For continuous reminders, trigger this endpoint from any external scheduler every 5 minutes:

```bash
curl -fsS https://invest-brain.vercel.app/api/alerts-cron
```

If `CRON_SECRET` is configured on Vercel, send it as a bearer token:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://invest-brain.vercel.app/api/alerts-cron
```

The endpoint still respects each user's `alertCheckIntervalMinutes`, so a 5-minute scheduler will not send faster than the interval saved in the app.
