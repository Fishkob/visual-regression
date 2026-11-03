import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PdfController } from '@public/visualTest/access/presentation/controllers/pdf.controller';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { PdfAccessService } from '@public/visualTest/access/application/pdf-access.service';
import type { PdfTestDetailsDto } from '@public/visualTest/access/presentation/dto/pdf-test-details.dto';
import { Response } from 'express';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';
describe('PdfController', () => {
  let controller: PdfController;
  let testQuery: Mocked<TestQueryService>;
  let pdfAccess: Mocked<PdfAccessService>;

  beforeEach(async () => {
    testQuery = createMock<TestQueryService>();
    pdfAccess = createMock<PdfAccessService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [
        { provide: TestQueryService, useValue: testQuery },
        { provide: PdfAccessService, useValue: pdfAccess },
        { provide: AppLoggerService, useValue: createMockLogger() },
      ],
    }).compile();

    controller = module.get(PdfController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPdfTestDetails', () => {
    it('delegates to test query service with optional filters', async () => {
      const expected = { id: 'test-1' };
      testQuery.getPdfTestDetails.mockResolvedValue(
        expected as unknown as PdfTestDetailsDto,
      );

      const result = await controller.getPdfTestDetails(
        'proj',
        'test',
        '1920x1080',
        'chrome',
        'staging',
      );

      expect(testQuery.getPdfTestDetails).toHaveBeenCalledWith(
        'proj',
        'test',
        {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        undefined,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('renderPdfPage', () => {
    it('renders a page through the pdf download application seam', async () => {
      pdfAccess.renderPdfPage.mockResolvedValue({
        imageUrl: 'http://storage/page-1.png',
        signedImageUrl: 'http://storage/page-1.png?sig',
        pageCount: 3,
      });

      const result = await controller.renderPdfPage(
        'proj',
        'test',
        'http://storage/file.pdf',
        1,
      );

      expect(pdfAccess.renderPdfPage).toHaveBeenCalledWith(
        'proj',
        'test',
        'http://storage/file.pdf',
        1,
        undefined,
      );
      expect(result).toEqual({
        imageUrl: 'http://storage/page-1.png',
        signedImageUrl: 'http://storage/page-1.png?sig',
        pageCount: 3,
      });
    });

    it('rejects when pdfUrl is missing', async () => {
      await expect(
        controller.renderPdfPage('proj', 'test', undefined, 1),
      ).rejects.toThrow('pdfUrl is required');
      expect(pdfAccess.renderPdfPage).not.toHaveBeenCalled();
    });
  });

  describe('downloadPdf', () => {
    let mockResponse: Mocked<Response>;

    beforeEach(() => {
      mockResponse = createMock<Response>();
    });

    it('streams the downloaded PDF as an attachment', async () => {
      pdfAccess.download.mockResolvedValue({
        buffer: Buffer.from('pdf-content'),
        filename: 'test-baseline.pdf',
        contentType: 'application/pdf',
      });

      await controller.downloadPdf('proj', 'test', 'baseline', mockResponse);

      expect(pdfAccess.download).toHaveBeenCalledWith(
        'proj',
        'test',
        'baseline',
        { viewport: undefined, browser: undefined, environment: undefined },
        undefined,
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="test-baseline.pdf"',
          'Content-Length': 11,
        }),
      );
      expect(mockResponse.send).toHaveBeenCalledWith(
        Buffer.from('pdf-content'),
      );
    });

    it('forwards variant filters to the download service', async () => {
      pdfAccess.download.mockResolvedValue({
        buffer: Buffer.from('pdf-content'),
        filename: 'test-baseline.pdf',
        contentType: 'application/pdf',
      });

      await controller.downloadPdf(
        'proj',
        'test',
        'baseline',
        mockResponse,
        '1920x1080',
        'chrome',
        'staging',
      );

      expect(pdfAccess.download).toHaveBeenCalledWith(
        'proj',
        'test',
        'baseline',
        {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        undefined,
      );
    });
  });
});
