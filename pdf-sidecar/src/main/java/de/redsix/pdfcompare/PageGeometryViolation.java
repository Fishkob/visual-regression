package de.redsix.pdfcompare;

/**
 * A PDF whose page geometry would make rasterising it exhaust the sidecar heap.
 * Distinct from the generic 400 "invalid upload" so the request layer can
 * answer 422 (well-formed document, unacceptable size) instead of 400.
 */
public class PageGeometryViolation extends IllegalArgumentException {

    public PageGeometryViolation(final String message) {
        super(message);
    }
}
