# pdf-sidecar

Java service (Javalin) for side-by-side PDF comparison. Used by the backend's worker to diff PDFs.

## Start

The sidecar is started as part of `docker compose up` (service `pdf-sidecar` in `docker-compose.yml`).

## Observability

Tracing is opt-in. The sidecar reads `OTEL_EXPORTER_OTLP_ENDPOINT`; when set, it exports spans over OTLP HTTP to that endpoint (with the `/v1/traces` path appended). When unset, tracing is a no-op. In Docker the javaagent and the app share the same endpoint from the container env.

### Starting with observability

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

Metrics are exposed via the Prometheus HTTP exporter on port 9464 and collected by the Prometheus scrape job. Traces are sent via OTLP to the OTEL Collector → Tempo → Grafana.
