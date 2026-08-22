package de.redsix.pdfcompare;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TelemetryTest {

    @Test
    void returnsBlankWhenEndpointUnset() {
        assertEquals("", Telemetry.resolveTracesEndpoint(null));
        assertEquals("", Telemetry.resolveTracesEndpoint("   "));
    }

    @Test
    void appendsTracesPathWhenMissing() {
        assertEquals(
            "http://alloy:4318/v1/traces",
            Telemetry.resolveTracesEndpoint("http://alloy:4318")
        );
    }

    @Test
    void keepsEndpointWhenAlreadyHasTracesPath() {
        assertEquals(
            "http://alloy:4318/v1/traces",
            Telemetry.resolveTracesEndpoint("http://alloy:4318/v1/traces")
        );
    }

    @Test
    void keepsEndpointWhenItAlreadyEndsWithSlashTraces() {
        assertEquals(
            "http://localhost:4318/v1/traces",
            Telemetry.resolveTracesEndpoint("http://localhost:4318/v1/traces")
        );
    }
}
