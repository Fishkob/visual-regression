package de.redsix.pdfcompare;

import io.javalin.http.Context;
import java.util.Map;

public class CompareController extends PdfRequestHandler {

    private final PdfCompareService comparator;

    public CompareController(final PdfValidator validator, final PdfCompareService comparator,
                             final Telemetry telemetry) {
        super(validator, telemetry);
        this.comparator = comparator;
    }

    @Override
    protected String spanName() {
        return "POST /compare";
    }

    @Override
    protected void doHandle(final Context ctx) {
        final var expectedFile = requireUpload(ctx, "expected");
        final var actualFile = requireUpload(ctx, "actual");

        final String thresholdStr = ctx.formParam("threshold");
        final double threshold;
        try {
            threshold = validator.parseThreshold(thresholdStr);
        } catch (final IllegalArgumentException e) {
            throw new RequestFailure(400, e.getMessage());
        }

        final byte[] expectedBytes = readAndValidatePdf(expectedFile);
        final byte[] actualBytes = readAndValidatePdf(actualFile);

        try {
            final PdfCompareService.DiffResult result = comparator.compare(expectedBytes, actualBytes, threshold);
            ctx.header("X-Mismatch-Count", String.valueOf(result.mismatchPageCount()));
            ctx.header("X-Page-Count", String.valueOf(result.pageCount()));
            ctx.header("Content-Type", "application/pdf");
            ctx.result(result.diffPdf());
        } catch (final Exception e) {
            throw new RequestFailure(500, "comparison failed");
        }
    }
}
