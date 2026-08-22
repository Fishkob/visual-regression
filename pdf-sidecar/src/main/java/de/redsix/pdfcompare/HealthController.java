package de.redsix.pdfcompare;

import io.javalin.http.Context;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class HealthController {

    private static final Logger LOG = LoggerFactory.getLogger(HealthController.class);

    private final Telemetry telemetry;

    public HealthController(final Telemetry telemetry) {
        this.telemetry = telemetry;
    }

    public void handle(final Context ctx) {
        final Map<String, Object> pdfboxStatus = checkPdfBox();
        final Map<String, Object> memoryInfo = getMemoryInfo();

        final boolean isUp = "UP".equals(pdfboxStatus.get("status"));

        ctx.header("Content-Type", "application/json");
        ctx.json(Map.of(
            "status", isUp ? "UP" : "DOWN",
            "details", Map.of(
                "pdfbox", pdfboxStatus,
                "memory", memoryInfo
            )
        ));
    }

    private static Map<String, Object> checkPdfBox() {
        try {
            Loader.loadPDF(new byte[]{'%', 'P', 'D', 'F'});
            return Map.of("status", "DOWN", "error", "loaded truncated PDF without error");
        } catch (final Exception e) {
            return Map.of("status", "UP");
        }
    }

    private static Map<String, Object> getMemoryInfo() {
        final Runtime rt = Runtime.getRuntime();
        final long free = rt.freeMemory();
        final long total = rt.totalMemory();
        final long max = rt.maxMemory();
        final long used = total - free;
        final double freePercent = max > 0 ? (double) free / max * 100 : 0;

        return Map.of(
            "freeBytes", free,
            "totalBytes", total,
            "maxBytes", max,
            "usedBytes", used,
            "freePercent", Math.round(freePercent * 10.0) / 10.0
        );
    }
}
