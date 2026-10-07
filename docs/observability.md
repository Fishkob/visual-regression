# Observability Stack

All observability components are **completely optional** and live in `docker-compose.observability.yml`. They are never started automatically — opt in when needed:

```bash
docker compose -f docker-compose.observability.yml up -d
```

Prometheus scrapes the app's authenticated `/api/v1/metrics`, sending the
`METRICS_API_KEY` via an `x-metrics-key` header read from a file. Create that
file (it is gitignored) before starting the stack:

```bash
cp backend/observability/secrets/x-metrics-key.example backend/observability/secrets/x-metrics-key
# then put the METRICS_API_KEY value in that file — no trailing newline
```

Without it, Prometheus still starts but the `visual-regression-api` scrape
returns 401.

> **Local-only by default:** all services bind to `127.0.0.1` (localhost), so the
> dashboards and endpoints are never reachable from the LAN or the internet. The
> stack ships with no authentication (Grafana uses its default admin/admin) —
> keep it on localhost for development. For a shared deployment, run your own
> monitoring stack and point the app at it (see [Bring Your Own Monitoring
> Stack](#bring-your-own-monitoring-stack)).

Every component has a clear job and can fail without affecting the application:

| Component      | Role                                             | Failure impact                     |
| -------------- | ------------------------------------------------ | ---------------------------------- |
| **OTel SDK**   | Generates spans in-process, exports via OTLP     | None (env var unset = no-op)       |
| **Alloy**      | Receives OTLP traces, ships Docker logs to Loki  | Spans dropped, logs not shipped    |
| **Tempo**      | Stores and indexes traces                        | Traces unqueryable, app unaffected |
| **Prometheus** | Scrapes app metrics; receives Alloy span-metrics | No metric history, app unaffected  |
| **Loki**       | Stores and indexes logs                          | Logs unqueryable, app unaffected   |
| **Grafana**    | Renders dashboards for traces, logs, and metrics | UI unreachable, app unaffected     |

## The three data paths in detail

1. **Traces (OTel):** The application creates one span per HTTP request (method, route, status code, duration). When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, the OTel SDK sends spans via OTLP/HTTP to Alloy. Alloy batches them and exports to Tempo. From Grafana you can search the trace list or drill from the service graph into individual flame graphs.

2. **Metrics (Prometheus):** The app exposes Prometheus-compatible metrics at `/api/v1/metrics` (request rates, job processing times). Prometheus pulls those on its scrape interval. Additionally, Alloy generates _span metrics_ via its `otelcol.connector.spanmetrics` — aggregated RED metrics (Rate, Errors, Duration) per service and route — and forwards them to Prometheus via remote write (`otelcol.exporter.prometheus` → `prometheus.remote_write`); `alloy:12345/metrics` only serves Alloy's own self-metrics. Grafana dashboards visualise everything.

3. **Logs (Loki):** The app writes structured JSON logs via Pino to stdout. Alloy collects these via the Docker socket, parses JSON fields, attaches container labels, and ships them to Loki. In Grafana you can filter logs by label or jump from a trace directly to its matching log lines.

In Kubernetes the entire stack can be replaced with an external service — the app never knows the difference. It only:

- Sends traces to the configured OTLP endpoint
- Exposes /metrics for Prometheus to pull
- Writes structured JSON logs to stdout (captured by the container runtime)

## Bring Your Own Monitoring Stack

If you already run your own monitoring infrastructure (Prometheus, Loki, Grafana, etc.) and want the VRT app to feed into it, you don't need the bundled observability stack at all. Just:

1. **Traces** — Set the `OTEL_EXPORTER_OTLP_ENDPOINT` env var to your OTLP-compatible endpoint (collector, Tempo, or SaaS).

2. **Metrics** — Set `METRICS_API_KEY` on the app, then add a scrape job to your Prometheus config that sends the same key in the `x-metrics-key` header:

   ```yaml
   scrape_configs:
     - job_name: visual-regression-api
       metrics_path: /api/v1/metrics
       http_headers:
         x-metrics-key:
           files: ["/etc/prometheus/secrets/x-metrics-key"]
       static_configs:
         - targets: ["<your-app-host>:3000"]
           labels:
             service: visual-regression-api
   ```

   The `/api/v1/metrics` endpoint is always mounted but returns HTTP 401 until `METRICS_API_KEY` is configured — Prometheus must send it via the `x-metrics-key` header (not Authorization/Bearer). Prometheus does not expand environment variables in `http_headers`; put the raw key (no trailing newline) in the file referenced by `files:`. See `backend/observability/prometheus.yml` for the bundled reference config.

3. **Logs** — The app writes structured JSON logs to stdout (Pino fields: `time`, `level`, `msg`, `logger`). Your existing log shipper (Promtail, Fluentd, Vector, etc.) will pick them up from the container runtime. Point it at your Loki and parse/relabel the JSON fields there — `backend/observability/alloy.alloy` (the `loki.process.json_parse` stage) is the reference pipeline.

4. **Dashboards** — Import the 4 pre-built Grafana dashboards from `backend/observability/grafana/dashboards/` into your Grafana instance. They visualize traces (via Tempo), metrics (via Prometheus), and logs (via Loki).
