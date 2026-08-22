package de.redsix.pdfcompare;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;

public class PdfValidator {

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

    private static boolean isPdfHeader(final byte[] data) {
        if (data.length < 4) {
            return false;
        }
        return data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F';
    }
}
