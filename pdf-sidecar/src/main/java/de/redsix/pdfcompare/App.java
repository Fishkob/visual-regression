package de.redsix.pdfcompare;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class App {

    private static final Logger LOG = LoggerFactory.getLogger(App.class);
    // Per-document cap. The backend enforces the same value on upload
    // (backend/src/config/upload-limits.ts MAX_PDF_UPLOAD_MB); changing one
    // without the other makes comparisons fail for documents that uploaded fine.
    private static final long MAX_PDF_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB
    // /compare posts baseline and candidate in ONE multipart request, so the
    // request budget has to fit two maximum-size documents plus multipart
    // overhead. Sizing it to one document was what made 2x-large pairs fail.
    private static final long MAX_REQUEST_BYTES = 2 * MAX_PDF_FILE_BYTES + 1024 * 1024;

    public static void main(final String[] args) {
        final int port = args.length > 0 ? Integer.parseInt(args[0]) : 3001;
        final App app = new App();
        final Javalin server = app.buildServer();
        server.start(port);
        LOG.info("PDF sidecar started on port {}", port);
    }

    private Javalin buildServer() {
        final Telemetry telemetry = new Telemetry();
        final PdfValidator validator = new PdfValidator(MAX_PDF_FILE_BYTES);
        final PdfCompareService comparator = new PdfCompareService();
        final PdfRenderer renderer = new PdfRenderer();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("Shutting down...");
            telemetry.close();
        }));

        return Javalin.create(config -> {
            config.http.maxRequestSize = MAX_REQUEST_BYTES;
            Routes.register(config.routes, validator, comparator, renderer, telemetry);
        });
    }
}
