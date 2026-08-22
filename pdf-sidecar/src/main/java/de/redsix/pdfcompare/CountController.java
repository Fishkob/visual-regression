package de.redsix.pdfcompare;

import io.javalin.http.Context;
import java.util.Map;

public class CountController extends PdfRequestHandler {

    private final PdfRenderer renderer;

    public CountController(final PdfValidator validator, final PdfRenderer renderer,
                           final Telemetry telemetry) {
        super(validator, telemetry);
        this.renderer = renderer;
    }

    @Override
    protected String spanName() {
        return "POST /count";
    }

    @Override
    protected void doHandle(final Context ctx) {
        final var pdfFile = requireUpload(ctx, "pdf");
        final byte[] pdfBytes = readAndValidatePdf(pdfFile);

        try {
            final int pageCount = renderer.getPageCount(pdfBytes);
            ctx.status(200)
                .header("X-Page-Count", String.valueOf(pageCount))
                .json(Map.of("pageCount", pageCount));
        } catch (final Exception e) {
            throw new RequestFailure(500, "page count failed");
        }
    }
}
