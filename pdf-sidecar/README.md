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

## Test

```bash
mvn -B test
```

30 JUnit tests: `CompareServiceTest` starts the Javalin server and drives the
`/compare` endpoint (upload limits, PNG/PDF validation, the diff output), and
`TelemetryTest` pins the OTLP endpoint rules. CI runs the same command in the
`PDF Sidecar Tests` job (`ci-backend.yml`); the Docker build and the CodeQL build
keep `-DskipTests`, so shipping and proving stay separate.
