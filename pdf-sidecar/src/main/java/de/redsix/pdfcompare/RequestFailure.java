package de.redsix.pdfcompare;

public class RequestFailure extends RuntimeException {

    private final int status;

    public RequestFailure(final int status, final String message) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
