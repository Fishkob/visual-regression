package de.redsix.pdfcompare;

import io.javalin.http.Context;

public class RenderController extends PdfRequestHandler {

    private final PdfRenderer renderer;

    public RenderController(final PdfValidator validator, final PdfRenderer renderer,
                            final Telemetry telemetry) {
        super(validator, telemetry);
        this.renderer = renderer;
    }

    @Override
    protected String spanName() {
        return "POST /render";
    }

    @Override
    protected void doHandle(final Context ctx) {
        final var pdfFile = requireUpload(ctx, "pdf");
        final String pageStr = ctx.formParam("page");
        badRequestIf(pageStr == null, "page number is required");

        final byte[] pdfBytes = readAndValidatePdf(pdfFile);

        try {
            final int totalPages = renderer.getPageCount(pdfBytes);
            final int page = validator.parsePageNumber(pageStr, totalPages);

            final PdfRenderer.RenderResult result = renderer.render(pdfBytes, page);

            ctx.header("Content-Type", "image/png");
            ctx.header("X-Page-Count", String.valueOf(result.pageCount()));
            ctx.result(result.pngBytes());
        } catch (final RequestFailure e) {
            throw e;
        } catch (final IllegalArgumentException e) {
            throw new RequestFailure(400, e.getMessage());
        } catch (final Exception e) {
            throw new RequestFailure(500, "rendering failed");
        }
    }
}
