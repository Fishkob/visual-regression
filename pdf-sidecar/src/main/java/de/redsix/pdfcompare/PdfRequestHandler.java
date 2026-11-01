package de.redsix.pdfcompare;

import io.javalin.http.Context;
import io.javalin.http.UploadedFile;
import io.opentelemetry.api.trace.Span;
import java.io.InputStream;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Shared request plumbing for the sidecar's multipart PDF endpoints: telemetry
 * span, missing-file 400, size 413, content-validate 400, and the catch-all
 * 500. Subclasses provide the endpoint-specific span name and domain body.
 */
public abstract class PdfRequestHandler {

    private static final Logger LOG = LoggerFactory.getLogger(PdfRequestHandler.class);

    protected final PdfValidator validator;
    protected final Telemetry telemetry;

    protected PdfRequestHandler(final PdfValidator validator, final Telemetry telemetry) {
        this.validator = validator;
        this.telemetry = telemetry;
    }

    public void handle(final Context ctx) {
        final Span span = telemetry.startSpan(spanName());
        try {
            doHandle(ctx);
            span.end();
        } catch (final RequestFailure failure) {
            ctx.status(failure.status()).json(Map.of("error", failure.getMessage()));
            span.end();
        } catch (final Exception e) {
            LOG.error("{} failed", spanName(), e);
            ctx.status(500).json(Map.of("error", spanName() + " failed"));
            telemetry.endSpan(span, e);
        }
    }

    protected abstract String spanName();

    protected abstract void doHandle(Context ctx);

    protected UploadedFile requireUpload(final Context ctx, final String name) {
        final UploadedFile file = ctx.uploadedFile(name);
        if (file == null) {
            throw new RequestFailure(400, name + " file is required");
        }
        return file;
    }

    protected byte[] readAndValidatePdf(final UploadedFile file) {
        try {
            validator.validateFileSize(file.size());
        } catch (final IllegalArgumentException e) {
            throw new RequestFailure(413, e.getMessage());
        }

        final byte[] pdfBytes;
        try (InputStream is = file.content()) {
            pdfBytes = validator.readAndValidatePdfContent(is);
        } catch (final IllegalArgumentException e) {
            throw new RequestFailure(400, e.getMessage());
        } catch (final Exception e) {
            throw new RequestFailure(400, "failed to read uploaded file");
        }

        try {
            validator.validatePageGeometry(pdfBytes);
        } catch (final PageGeometryViolation e) {
            throw new RequestFailure(422, e.getMessage());
        } catch (final IllegalArgumentException e) {
            throw new RequestFailure(400, e.getMessage());
        }
        return pdfBytes;
    }

    protected void badRequestIf(final boolean condition, final String message) {
        if (condition) {
            throw new RequestFailure(400, message);
        }
    }
}
