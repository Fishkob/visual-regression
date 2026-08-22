package de.redsix.pdfcompare;

import de.redsix.pdfcompare.env.SimpleEnvironment;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

public class PdfCompareService {

    public DiffResult compare(final byte[] expected, final byte[] actual, final double threshold) throws IOException {
        try (ByteArrayInputStream expectedIs = new ByteArrayInputStream(expected);
             ByteArrayInputStream actualIs = new ByteArrayInputStream(actual)) {
            final SimpleEnvironment env = new SimpleEnvironment()
                .setAllowedDiffInPercent(threshold);
            final CompareResult result = new PdfComparator(expectedIs, actualIs)
                .withEnvironment(env)
                .compare();

            final ByteArrayOutputStream baos = new ByteArrayOutputStream();
            result.writeTo(baos);

            return new DiffResult(
                baos.toByteArray(),
                result.getDifferences().size(),
                result.getNumberOfPages()
            );
        }
    }

    public record DiffResult(byte[] diffPdf, int mismatchPageCount, int pageCount) {}
}
