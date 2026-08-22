package de.redsix.pdfcompare;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;

public class PdfRenderer {

    private static final int RENDER_DPI = 150;

    public int getPageCount(final byte[] pdfBytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            return document.getNumberOfPages();
        }
    }

    public RenderResult render(final byte[] pdfBytes, final int page) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            final PDFRenderer renderer = new PDFRenderer(document);
            final BufferedImage image = renderer.renderImageWithDPI(page - 1, RENDER_DPI);

            final ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "png", baos);

            return new RenderResult(baos.toByteArray(), document.getNumberOfPages());
        }
    }

    public record RenderResult(byte[] pngBytes, int pageCount) {}
}
