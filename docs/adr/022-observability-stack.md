# ADR 022: Observability Stack — OpenTelemetry, Loki, Prometheus, Grafana

## Status

Accepted — 2026-06-26 (amended 2026-06-30, 2026-07-08)

## Context

The backend has foundational observability primitives: structured JSON logging via Pino, Prometheus metrics via prom-client, health check endpoints, and manual traceId propagation via AsyncLocalStorage. These lack distributed tracing across the API → queue → worker chain, dashboards, and alerting. The stack must not degrade the application if any observability component is unreachable.

## Decision

Add an open-source observability stack in a separate `docker-compose.observability.yml`:

- **In-process**: OpenTelemetry SDK with auto-instrumentation for HTTP, Express, Prisma (non-blocking batch export)
- **Grafana Alloy** (single agent replacing OTel Collector + Promtail) — receives OTLP traces, ships Docker logs to Loki
- **Grafana Tempo** — trace storage
- **Loki** — log aggregation
- **Prometheus** — scrapes `/metrics` and Alloy span-metrics
- **Grafana** — dashboards for traces, logs, metrics + alerting rules (Grafana-native, no Alertmanager)

The existing Pino logger and `/metrics` endpoint remain unchanged. All observability infra is opt-in — `scripts/dev.sh infra` does not start it.

## Rationale

- **Automatic instrumentation**: OTel SDK auto-instruments HTTP, Express, Prisma — no manual span creation
- **Resilience by design**: Batch export is non-blocking, app has no awareness of the stack
- **Standard protocol**: OpenTelemetry allows future export to any backend by changing collector config only
- **Opt-in infra**: Keeps dev environment resource usage low

## Alternatives Considered

- **Datadog / commercial APM**: Vendor lock-in, per-host cost
- **Jaeger**: Mature but Tempo integrates more naturally with Grafana
- **Separate otel-collector + Promtail**: Replaced by single Grafana Alloy instance (one config language, fewer containers)

## Consequences

- Developers opt in with `docker compose -f docker-compose.observability.yml up -d`
- OTel SDK adds ~10-20ms to startup time, negligible runtime overhead
- Auto-instrumentation covers all HTTP requests and Prisma queries
- The observability stack is fully optional and failure-isolated from the application
- See `docs/observability.md` for detailed data flows, configuration, and bring-your-own-stack instructions
