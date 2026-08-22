package de.redsix.pdfcompare;

import io.javalin.router.JavalinDefaultRoutingApi;

/**
 * Single registration site for the sidecar's routes. Both {@code App} and the
 * integration test build the server through here so the route table can never
 * drift between production and test.
 */
public final class Routes {

    private Routes() {
    }

    public static void register(final JavalinDefaultRoutingApi routes, final PdfValidator validator,
                                final PdfCompareService comparator, final PdfRenderer renderer,
                                final Telemetry telemetry) {
        routes.get("/health", new HealthController(telemetry)::handle);
        routes.post("/compare", new CompareController(validator, comparator, telemetry)::handle);
        routes.post("/render", new RenderController(validator, renderer, telemetry)::handle);
        routes.post("/count", new CountController(validator, renderer, telemetry)::handle);
    }
}
