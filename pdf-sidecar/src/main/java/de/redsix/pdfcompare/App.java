package de.redsix.pdfcompare;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class App {

    private static final Logger LOG = LoggerFactory.getLogger(App.class);
    private static final long MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

    public static void main(final String[] args) {
        final int port = args.length > 0 ? Integer.parseInt(args[0]) : 3001;
        final App app = new App();
        final Javalin server = app.buildServer();
        server.start(port);
        LOG.info("PDF sidecar started on port {}", port);
    }

    private Javalin buildServer() {
        final Telemetry telemetry = new Telemetry();
        final PdfValidator validator = new PdfValidator(MAX_UPLOAD_SIZE_BYTES);
        final PdfCompareService comparator = new PdfCompareService();
        final PdfRenderer renderer = new PdfRenderer();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("Shutting down...");
            telemetry.close();
        }));

        return Javalin.create(config -> {
            config.http.maxRequestSize = MAX_UPLOAD_SIZE_BYTES + 1024;
            Routes.register(config.routes, validator, comparator, renderer, telemetry);
        });
    }
}
