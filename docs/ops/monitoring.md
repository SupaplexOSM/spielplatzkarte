# Monitoring

The hub container exposes two endpoints for observing federation health:

| Endpoint | Format | Purpose |
|---|---|---|
| `/federation-status.json` | JSON | Human-readable per-backend rollup |
| `/metrics` | Prometheus text | Scrape target for Prometheus/Grafana stacks |

Both are written atomically every 60 seconds by a cron job inside the hub container. Neither endpoint requires authentication. `Cache-Control: no-store` is set on both.

## `/federation-status.json`

```json
{
  "generated_at": "2026-04-26T12:00:00Z",
  "poll_interval_seconds": 60,
  "backends": {
    "fulda": {
      "url": "https://fulda.example.com/api",
      "up": true,
      "latency_seconds": 0.043,
      "last_success": "2026-04-26T12:00:00Z",
      "last_import_at": "2026-04-25T03:12:00Z",
      "data_age_seconds": 118080,
      "playground_count": 42,
      "complete": 28,
      "partial": 10,
      "missing": 4
    }
  }
}
```

**Fields:**

| Field | Notes |
|---|---|
| `generated_at` | ISO 8601 timestamp when this file was written. Use this to detect a frozen hub (`generated_at` older than `2 × poll_interval_seconds`). |
| `poll_interval_seconds` | Always `60` in the current release. |
| `backends.<slug>.up` | `true` if the backend responded to `GET /rpc/get_meta` within 3 s. |
| `backends.<slug>.latency_seconds` | Round-trip time of the last successful poll. `0` on failure. |
| `backends.<slug>.last_success` | ISO 8601 timestamp of the last successful probe, preserved across failures. `null` if the backend was never reachable. |
| `backends.<slug>.last_import_at` | Value of `api.import_status.last_import_at` from the backend DB. `null` if no import has run or backend is down. |
| `backends.<slug>.data_age_seconds` | Seconds since `last_import_at`. `null` if `last_import_at` is `null`. |
| `backends.<slug>.playground_count` | Total playgrounds in the region. `null` on pre-P1 backends or when backend is down. |
| `backends.<slug>.complete` | Playgrounds with complete equipment data. `null` on pre-P1 backends. |
| `backends.<slug>.partial` | Playgrounds with partial equipment data. `null` on pre-P1 backends. |
| `backends.<slug>.missing` | Playgrounds with no equipment data. `null` on pre-P1 backends. |

The hub UI reads this endpoint every 60 seconds and surfaces freshness labels in the instance drawer. It also shows a "stale observation" banner when `generated_at` is older than `2 × poll_interval_seconds` (i.e. the hub cron has stopped writing).

## `/metrics`

Prometheus text exposition format (version 0.0.4):

```
# HELP spielplatz_backend_up 1 if the backend responded to get_meta, 0 otherwise.
# TYPE spielplatz_backend_up gauge
spielplatz_backend_up{backend="fulda",url="https://fulda.example.com/api"} 1

# HELP spielplatz_backend_importing 1 while osm2pgsql is actively running on this backend, 0 otherwise.
# TYPE spielplatz_backend_importing gauge
spielplatz_backend_importing{backend="fulda",url="https://fulda.example.com/api"} 0

# HELP spielplatz_backend_latency_seconds Round-trip time for the last get_meta call.
# TYPE spielplatz_backend_latency_seconds gauge
spielplatz_backend_latency_seconds{backend="fulda",url="https://fulda.example.com/api"} 0.043

# HELP spielplatz_backend_data_age_seconds Seconds since the backend last imported data.
# TYPE spielplatz_backend_data_age_seconds gauge
spielplatz_backend_data_age_seconds{backend="fulda",url="https://fulda.example.com/api"} 118080

# HELP spielplatz_backend_playgrounds_total Total number of playgrounds in the region.
# TYPE spielplatz_backend_playgrounds_total gauge
spielplatz_backend_playgrounds_total{backend="fulda",url="https://fulda.example.com/api"} 42

# HELP spielplatz_backend_playgrounds_complete Playgrounds with complete equipment data.
# TYPE spielplatz_backend_playgrounds_complete gauge
spielplatz_backend_playgrounds_complete{backend="fulda",url="https://fulda.example.com/api"} 28

# HELP spielplatz_backend_playgrounds_partial Playgrounds with partial equipment data.
# TYPE spielplatz_backend_playgrounds_partial gauge
spielplatz_backend_playgrounds_partial{backend="fulda",url="https://fulda.example.com/api"} 10

# HELP spielplatz_backend_playgrounds_missing Playgrounds with no equipment data.
# TYPE spielplatz_backend_playgrounds_missing gauge
spielplatz_backend_playgrounds_missing{backend="fulda",url="https://fulda.example.com/api"} 4

# HELP spielplatz_poll_generated_timestamp Unix timestamp when this scrape was generated.
# TYPE spielplatz_poll_generated_timestamp gauge
spielplatz_poll_generated_timestamp 1745668800
```

`spielplatz_backend_data_age_seconds` and the four completeness gauges are omitted for a backend when the field is `null` (backend down, pre-P1 backend, or no import yet). `spielplatz_backend_importing` is always emitted when the backend is reachable; it defaults to `0` for older backends that predate the `importing` field in `get_meta`.

## Recipes

### Recipe 1 — External uptime monitor

Point any HTTP uptime tool (UptimeRobot, Better Stack, etc.) at:

```
GET https://<hub-host>/federation-status.json
```

Check that:

1. The response is `200 OK`.
2. `generated_at` is within the last 5 minutes (guards against cron death).
3. All expected `backends.<slug>.up` values are `true`.

### Recipe 2 — BYO Prometheus + Grafana

Add a scrape job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: spieli_hub
    static_configs:
      - targets: ['<hub-host>:80']
    metrics_path: /metrics
    scrape_interval: 60s
```

Useful PromQL expressions:

```promql
# Is any backend currently down?
spielplatz_backend_up == 0

# Alert if data is more than 48 hours old
spielplatz_backend_data_age_seconds > 172800

# Alert if the hub poll has stopped writing (cron died)
time() - spielplatz_poll_generated_timestamp > 300

# Completeness ratio per backend (fraction of playgrounds with full data)
spielplatz_backend_playgrounds_complete / spielplatz_backend_playgrounds_total

# Total playgrounds with missing data across all backends
sum(spielplatz_backend_playgrounds_missing)

# Alert if completeness ratio drops below 50 % for any backend
spielplatz_backend_playgrounds_complete / spielplatz_backend_playgrounds_total < 0.5

# Which backends are currently importing (data in flux)?
spielplatz_backend_importing == 1

# Backend online but no data and not importing (degraded ring state)
spielplatz_backend_up == 1
  and spielplatz_backend_importing == 0
  and spielplatz_backend_playgrounds_total == 0
```

### Recipe 3 — Frontend error monitoring (Sentry)

The hub frontend does not ship in-repo error reporting. For production deployments, sign up for [Sentry's free tier](https://sentry.io/pricing/) and add the Sentry browser SDK to your `nginx` serving config or `config.js` generation step. The DSN stays out of this repository.

## See also

- [Federation](../reference/federation.md) — overall federation architecture, `registry.json` format.
- [registry.json reference](../reference/registry-json.md) — backend slug, URL, and metadata fields.
- [API reference](../reference/api.md) — `get_meta()` response shape including `last_import_at`.
