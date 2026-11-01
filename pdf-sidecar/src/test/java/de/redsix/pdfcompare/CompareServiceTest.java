package de.redsix.pdfcompare;

import io.javalin.Javalin;
import io.opentelemetry.api.OpenTelemetry;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpHeaders;
import java.util.Arrays;
import java.util.UUID;


import static org.junit.jupiter.api.Assertions.*;

class CompareServiceTest {
    private static final byte[] PNG_HEADER = new byte[]{
        (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    };
    // Mirrors App's constants: per-document cap, and a request budget that fits
    // the baseline + candidate pair posted to /compare.
    private static final long MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
    private static final long MAX_REQUEST_SIZE = 2 * MAX_UPLOAD_SIZE + 1024 * 1024;

    private static Javalin server;
    private static int port;
    private static HttpClient client;

    @BeforeAll
    static void startServer() {
        var validator = new PdfValidator(MAX_UPLOAD_SIZE);
        var comparator = new PdfCompareService();
        var renderer = new PdfRenderer();
        var telemetry = new Telemetry(OpenTelemetry.noop().getTracer("test"));

        server = Javalin.create(config -> {
            config.http.maxRequestSize = MAX_REQUEST_SIZE;
            Routes.register(config.routes, validator, comparator, renderer, telemetry);
        }).start(0);
        port = server.port();
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    static void stopServer() {
        server.stop();
    }

    @Test
    void shouldRejectWhenExpectedFileMissing() throws Exception {
        byte[] pdf = createPdf("any");
        var response = sendRequest(null, pdf, null);
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldRejectWhenActualFileMissing() throws Exception {
        byte[] pdf = createPdf("any");
        var response = sendRequest(pdf, null, null);
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldRejectInvalidThreshold() throws Exception {
        byte[] pdfA = createPdf("hello");
        byte[] pdfB = createPdf("world");
        var response = sendRequest(pdfA, pdfB, "abc");
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldRejectNegativeThreshold() throws Exception {
        byte[] pdfA = createPdf("hello");
        byte[] pdfB = createPdf("world");
        var response = sendRequest(pdfA, pdfB, "-1");
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldRejectInfiniteThreshold() throws Exception {
        byte[] pdfA = createPdf("hello");
        byte[] pdfB = createPdf("world");
        var response = sendRequest(pdfA, pdfB, "Infinity");
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldRejectNaNThreshold() throws Exception {
        byte[] pdfA = createPdf("hello");
        byte[] pdfB = createPdf("world");
        var response = sendRequest(pdfA, pdfB, "NaN");
        assertEquals(400, response.statusCode);
    }

    @Test
    void shouldCompareIdenticalPdfs() throws Exception {
        byte[] pdf = createPdf("identical content");
        var response = sendRequest(pdf, pdf, null);
        assertEquals(200, response.statusCode);
        assertEquals("application/pdf", response.headers.firstValue("Content-Type").orElse(""));
        assertEquals("0", response.headers.firstValue("X-Mismatch-Count").orElse(""));
        assertTrue(response.body.length > 0);
    }

    @Test
    void shouldDetectDifferences() throws Exception {
        byte[] pdfA = createPdf("hello world");
        byte[] pdfB = createPdf("goodbye world");
        var response = sendRequest(pdfA, pdfB, "0");
        assertEquals(200, response.statusCode);
        String mismatchCount = response.headers.firstValue("X-Mismatch-Count").orElse("");
        assertNotEquals("0", mismatchCount);
        assertTrue(response.body.length > 0);
    }

    @Test
    void shouldReturnValidPdfOnMismatch() throws Exception {
        byte[] pdfA = createPdf("alpha content here");
        byte[] pdfB = createPdf("omega content here");
        var response = sendRequest(pdfA, pdfB, null);
        assertEquals(200, response.statusCode);
        assertEquals("application/pdf", response.headers.firstValue("Content-Type").orElse(""));
        String bodyStr = new String(response.body, java.nio.charset.StandardCharsets.US_ASCII);
        assertTrue(bodyStr.startsWith("%PDF"), "Response body should be a valid PDF");
    }

    @Test
    void thresholdAllowsAllDifferences() throws Exception {
        byte[] pdfA = createPdf("completely different first page");
        byte[] pdfB = createPdf("totally different second page");
        var response = sendRequest(pdfA, pdfB, "100");
        assertEquals(200, response.statusCode);
        assertEquals("0", response.headers.firstValue("X-Mismatch-Count").orElse(""),
            "100% threshold should accept any pixel difference");
    }

    @Test
    void shouldReturnPageCount() throws Exception {
        byte[] pdf = createPdf("single page content");
        var response = sendRequest(pdf, pdf, null);
        assertEquals(200, response.statusCode);
        assertEquals("1", response.headers.firstValue("X-Page-Count").orElse(""));
    }

    @Test
    void healthEndpointShouldReturn200() throws Exception {
        var request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/health"))
            .GET()
            .build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals("application/json", response.headers().firstValue("Content-Type").orElse(""));
        assertTrue(response.body().contains("\"status\""));
        assertTrue(response.body().contains("\"UP\""));
    }

    @Test
    void shouldAcceptZeroThreshold() throws Exception {
        byte[] pdfA = createPdf("exact match");
        byte[] pdfB = createPdf("exact match");
        var response = sendRequest(pdfA, pdfB, "0");
        assertEquals(200, response.statusCode);
        assertEquals("0", response.headers.firstValue("X-Mismatch-Count").orElse(""));
    }

    @Test
    void shouldRenderSinglePageAsPng() throws Exception {
        byte[] pdf = createPdf("hello world");
        var response = sendRenderRequest(pdf, "1");
        assertEquals(200, response.statusCode());
        assertEquals("image/png", response.headers().firstValue("Content-Type").orElse(""));
        assertTrue(response.body().length >= 8);
        assertArrayEquals(
            PNG_HEADER,
            Arrays.copyOf(response.body(), 8)
        );
    }

    @Test
    void shouldReturn400ForPageOutOfRange() throws Exception {
        byte[] pdf = createPdf("hello world");
        var response = sendRenderRequest(pdf, "999");
        assertEquals(400, response.statusCode());
    }

    @Test
    void shouldReturn400WhenPdfFileMissing() throws Exception {
        var response = sendRenderRequest(null, "1");
        assertEquals(400, response.statusCode());
    }

    @Test
    void shouldReturn400WhenPageMissing() throws Exception {
        byte[] pdf = createPdf("hello world");
        var response = sendRenderRequest(pdf, null);
        assertEquals(400, response.statusCode());
    }

    @Test
    void shouldReturnPageCountFromCountEndpoint() throws Exception {
        byte[] pdf = createPdf("single page content");
        var response = sendCountRequest(pdf);
        assertEquals(200, response.statusCode());
        assertEquals("1", response.headers().firstValue("X-Page-Count").orElse(""));
    }

    @Test
    void shouldReturn400WhenPdfMissingFromCountEndpoint() throws Exception {
        var response = sendCountRequest(null);
        assertEquals(400, response.statusCode());
    }

    @Test
    void shouldReturn400ForInvalidPageNumber() throws Exception {
        byte[] pdf = createPdf("hello world");
        var response = sendRenderRequest(pdf, "abc");
        assertEquals(400, response.statusCode());
    }

    @Test
    void shouldReturn400ForPageLessThanOne() throws Exception {
        byte[] pdf = createPdf("hello world");
        var response = sendRenderRequest(pdf, "0");
        assertEquals(400, response.statusCode());
    }

    // A PDF whose MediaBox is far larger than any real document. 20000x20000 pt
    // is ~6.9 GB of raster data at 150 dpi, i.e. an instant OOM without the
    // geometry guard.
    private static byte[] createPdfWithPageSize(float width, float height) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new org.apache.pdfbox.pdmodel.common.PDRectangle(width, height)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] createPdf(String text) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText(text);
                cs.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private Response sendRequest(byte[] expected, byte[] actual, String threshold) throws Exception {
        String boundary = "----" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();

        if (expected != null) {
            writeFilePart(body, boundary, "expected", "expected.pdf", expected);
        }
        if (actual != null) {
            writeFilePart(body, boundary, "actual", "actual.pdf", actual);
        }
        if (threshold != null) {
            writeFieldPart(body, boundary, "threshold", threshold);
        }
        body.write(("--" + boundary + "--\r\n").getBytes());

        var request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/compare"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
            .build();

        var httpResponse = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        return new Response(httpResponse.statusCode(), httpResponse.headers(), httpResponse.body());
    }

    private static void writeFilePart(ByteArrayOutputStream out, String boundary,
                                      String name, String filename, byte[] data) throws Exception {
        out.write(("--" + boundary + "\r\n").getBytes());
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n").getBytes());
        out.write("Content-Type: application/pdf\r\n".getBytes());
        out.write("\r\n".getBytes());
        out.write(data);
        out.write("\r\n".getBytes());
    }

    private static void writeFieldPart(ByteArrayOutputStream out, String boundary,
                                       String name, String value) throws Exception {
        out.write(("--" + boundary + "\r\n").getBytes());
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n").getBytes());
        out.write("\r\n".getBytes());
        out.write(value.getBytes());
        out.write("\r\n".getBytes());
    }

    private record Response(int statusCode, HttpHeaders headers, byte[] body) {}

    private Response sendRenderRequest(byte[] pdf, String page) throws Exception {
        String boundary = "----" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();

        if (pdf != null) {
            writeFilePart(body, boundary, "pdf", "document.pdf", pdf);
        }
        if (page != null) {
            writeFieldPart(body, boundary, "page", page);
        }
        body.write(("--" + boundary + "--\r\n").getBytes());

        var request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/render"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
            .build();

        var httpResponse = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        return new Response(httpResponse.statusCode(), httpResponse.headers(), httpResponse.body());
    }

    private Response sendCountRequest(byte[] pdf) throws Exception {
        String boundary = "----" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();

        if (pdf != null) {
            writeFilePart(body, boundary, "pdf", "document.pdf", pdf);
        }
        body.write(("--" + boundary + "--\r\n").getBytes());

        var request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + port + "/count"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
            .build();

        var httpResponse = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        return new Response(httpResponse.statusCode(), httpResponse.headers(), httpResponse.body());
    }

    @Test
    void shouldReturn413WhenPdfExceedsMaxSize() throws Exception {
        byte[] largePdf = new byte[20 * 1024 * 1024 + 1];
        var response = sendRenderRequest(largePdf, "1");
        assertEquals(413, response.statusCode());
    }

    // The page geometry is attacker-controlled through the MediaBox: a tiny
    // file can declare a page that renders into gigabytes. Every rendering
    // endpoint must reject it before PDFBox allocates the raster.
    @Test
    void shouldRejectOversizedPageOnCount() throws Exception {
        byte[] pdf = createPdfWithPageSize(20000, 20000);
        var response = sendCountRequest(pdf);
        assertEquals(422, response.statusCode());
    }

    @Test
    void shouldRejectOversizedPageOnRender() throws Exception {
        byte[] pdf = createPdfWithPageSize(20000, 20000);
        var response = sendRenderRequest(pdf, "1");
        assertEquals(422, response.statusCode());
    }

    @Test
    void shouldRejectOversizedPageOnCompare() throws Exception {
        byte[] normal = createPdf("baseline");
        byte[] oversized = createPdfWithPageSize(20000, 20000);
        var response = sendRequest(normal, oversized, null);
        assertEquals(422, response.statusCode());
    }

    @Test
    void shouldAcceptA3Page() throws Exception {
        byte[] pdf = createPdfWithPageSize(842, 1191);
        var response = sendCountRequest(pdf);
        assertEquals(200, response.statusCode());
    }
}
