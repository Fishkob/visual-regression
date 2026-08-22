package de.redsix.pdfcompare;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Telemetry implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(Telemetry.class);

    private final OpenTelemetrySdk sdk;
    private final Tracer tracer;

    public Telemetry() {
        OpenTelemetrySdk sdkInstance = null;
        try {
            final String endpoint = resolveTracesEndpoint(System.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"));
            if (!endpoint.isBlank()) {
                final OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
                    .setEndpoint(endpoint)
                    .build();
                final BatchSpanProcessor processor = BatchSpanProcessor.builder(exporter).build();
                final SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                    .addSpanProcessor(processor)
                    .build();
                sdkInstance = OpenTelemetrySdk.builder()
                    .setTracerProvider(tracerProvider)
                    .build();
                Runtime.getRuntime().addShutdownHook(new Thread(this::close));
                LOG.info("OpenTelemetry SDK initialized with OTLP HTTP exporter to {}", endpoint);
            } else {
                LOG.info("OTEL_EXPORTER_OTLP_ENDPOINT not set, tracing disabled");
            }
        } catch (final Exception e) {
            LOG.warn("Failed to initialize OpenTelemetry SDK, using no-op: {}", e.getMessage());
        }
        sdk = sdkInstance;
        tracer = sdk != null ? sdk.getTracer("pdf-sidecar")
            : io.opentelemetry.api.OpenTelemetry.noop().getTracer("pdf-sidecar");
    }

    /**
     * Resolves the full traces endpoint from the OTLP base endpoint. OTLP HTTP
     * expects the path to end in {@code /v1/traces}; docker-compose sets
     * {@code OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318}, which must be
     * suffixed. A blank or absent value disables tracing.
     */
    static String resolveTracesEndpoint(final String rawEndpoint) {
        if (rawEndpoint == null || rawEndpoint.isBlank()) {
            return "";
        }
        final String trimmed = rawEndpoint.trim();
        return trimmed.endsWith("/v1/traces") ? trimmed : trimmed + "/v1/traces";
    }

    Telemetry(final Tracer tracer) {
        this.sdk = null;
        this.tracer = tracer;
    }

    public Tracer getTracer() {
        return tracer;
    }

    public Span startSpan(final String name) {
        return tracer.spanBuilder(name).startSpan();
    }

    public void endSpan(final Span span, final Throwable error) {
        if (error != null) {
            span.recordException(error);
            span.setStatus(StatusCode.ERROR, error.getMessage());
        }
        span.end();
    }

    @Override
    public void close() {
        if (sdk != null) {
            try {
                sdk.close();
                LOG.info("OpenTelemetry SDK closed");
            } catch (final Exception e) {
                LOG.warn("Error closing OpenTelemetry SDK: {}", e.getMessage());
            }
        }
    }
}
