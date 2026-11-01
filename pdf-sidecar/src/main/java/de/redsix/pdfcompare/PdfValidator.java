package de.redsix.pdfcompare;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

public class PdfValidator {

    // Page geometry is validated at the highest resolution any consumer renders
    // with: the comparison engine's default 300 DPI (this sidecar's own renderer
    // uses 150 DPI, which is strictly cheaper). A page that stays inside this
    // budget cannot allocate gigabytes of raster data during a render, so a
    // crafted MediaBox can no longer OOM-kill the shared sidecar.
    static final int VALIDATION_DPI = 300;
    static final long MAX_PAGE_PIXELS = 20_000_000L;
    static final int MAX_PAGE_DIMENSION_PX = 10_000;

    private final long maxUploadSizeBytes;

    public PdfValidator(final long maxUploadSizeBytes) {
        this.maxUploadSizeBytes = maxUploadSizeBytes;
    }

    public long getMaxUploadSizeBytes() {
        return maxUploadSizeBytes;
    }

    public void validateFileSize(final long size) {
        if (size > maxUploadSizeBytes) {
            throw new IllegalArgumentException(
                "file exceeds maximum upload size of " + (maxUploadSizeBytes / (1024 * 1024)) + " MB"
            );
        }
    }

    public double parseThreshold(final String thresholdStr) {
        if (thresholdStr == null || thresholdStr.isEmpty()) {
            return 0.2;
        }
        try {
            final double threshold = Double.parseDouble(thresholdStr);
            if (Double.isNaN(threshold) || Double.isInfinite(threshold) || threshold < 0) {
                throw new IllegalArgumentException("invalid threshold");
            }
            return threshold;
        } catch (final NumberFormatException e) {
            throw new IllegalArgumentException("invalid threshold");
        }
    }

    public int parsePageNumber(final String pageStr, final int totalPages) {
        if (pageStr == null) {
            throw new IllegalArgumentException("page number is required");
        }
        try {
            final int page = Integer.parseInt(pageStr);
            if (page < 1) {
                throw new IllegalArgumentException("page must be >= 1");
            }
            if (page > totalPages) {
                throw new IllegalArgumentException("page number exceeds total pages");
            }
            return page;
        } catch (final NumberFormatException e) {
            throw new IllegalArgumentException("invalid page number");
        }
    }

    public byte[] readAndValidatePdfContent(final InputStream is) throws IOException {
        final byte[] prefix = is.readNBytes(5);
        if (!isPdfHeader(prefix)) {
            throw new IllegalArgumentException("uploaded file must be a PDF");
        }
        final byte[] rest = is.readAllBytes();
        final byte[] result = Arrays.copyOf(prefix, prefix.length + rest.length);
        System.arraycopy(rest, 0, result, prefix.length, rest.length);
        return result;
    }

    // A PDF page's pixel size is attacker-controlled through its MediaBox, and
    // the byte-size cap says nothing about it: a 1 KB page declaring
    // 20000x20000 pt renders to ~6.9 GB at 150 DPI. Every rendering path
    // (/count, /render, /compare) therefore runs this check before touching a
    // page, so an oversized document is rejected at upload time instead of
    // taking the shared sidecar down for every user.
    public void validatePageGeometry(final byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            final int pageCount = document.getNumberOfPages();
            for (int index = 0; index < pageCount; index++) {
                final PDPage page = document.getPage(index);
                final PDRectangle box = page.getCropBox();
                if (box == null || box.getWidth() <= 0 || box.getHeight() <= 0) {
                    throw new IllegalArgumentException(
                        "PDF page " + (index + 1) + " has no usable page box"
                    );
                }
                final long widthPx = Math.round(box.getWidth() / 72.0 * VALIDATION_DPI);
                final long heightPx = Math.round(box.getHeight() / 72.0 * VALIDATION_DPI);
                if (widthPx > MAX_PAGE_DIMENSION_PX || heightPx > MAX_PAGE_DIMENSION_PX
                    || widthPx * heightPx > MAX_PAGE_PIXELS) {
                    throw new PageGeometryViolation(
                        "PDF page " + (index + 1) + " is too large to render: "
                            + Math.round(box.getWidth()) + "x" + Math.round(box.getHeight())
                            + " pt (" + widthPx + "x" + heightPx + " px at " + VALIDATION_DPI
                            + " dpi). Maximum is " + MAX_PAGE_PIXELS + " px per page."
                    );
                }
            }
        } catch (final IOException e) {
            throw new IllegalArgumentException("uploaded file is not a readable PDF");
        }
    }

    private static boolean isPdfHeader(final byte[] data) {
        if (data.length < 4) {
            return false;
        }
        return data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F';
    }
}
