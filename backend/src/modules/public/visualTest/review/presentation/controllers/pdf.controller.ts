import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  Res,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { PdfAccessService } from '@public/visualTest/review/application/pdf-access.service';
import { PdfTestDetailsDto } from '@public/visualTest/review/presentation/dto/pdf-test-details.dto';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import type { Response } from 'express';

@ApiTags('Tests')
@Controller('projects/:projectName/tests')
export class PdfController {
  constructor(
    private readonly testQuery: TestQueryService,
    private readonly pdfAccess: PdfAccessService,
  ) {}

  @Get(':testName/pdf-details')
  @ApiOperation({
    summary: 'Get PDF test details including baseline and comparison',
  })
  @ApiOkResponse({
    description: 'PDF test details with baseline and comparison information',
    type: PdfTestDetailsDto,
  })
  @ApiQuery({
    name: 'viewport',
    required: false,
    description:
      'Variant filter — at least one of viewport/browser/environment is required',
  })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  async getPdfTestDetails(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query('viewport') viewport?: string,
    @Query('browser') browser?: string,
    @Query('environment') environment?: string,
  ) {
    return this.testQuery.getPdfTestDetails(projectName, testName, {
      viewport,
      browser,
      environment,
    });
  }

  @Get(':testName/pdf-render')
  @ApiOperation({
    summary: 'Render a single PDF page as PNG (cached in MinIO)',
  })
  @ApiOkResponse({ description: 'Rendered page PNG URL and page count' })
  @ApiQuery({ name: 'pdfUrl', required: true })
  @ApiQuery({ name: 'page', required: true })
  async renderPdfPage(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query('pdfUrl') pdfUrl: string | undefined,
    @Query('page', new ParseIntPipe({ optional: false })) page: number,
  ) {
    if (!pdfUrl) {
      throw new BadRequestException('pdfUrl is required');
    }
    return this.pdfAccess.renderPdfPage(projectName, testName, pdfUrl, page);
  }

  @Get(':testName/pdf-download')
  @ApiOperation({
    summary: 'Download baseline, candidate, or diff PDF for a test',
  })
  @ApiQuery({
    name: 'type',
    required: true,
    description: 'Which PDF to download: baseline, candidate, or diff',
  })
  @ApiQuery({
    name: 'viewport',
    required: false,
    description:
      'Variant filter — at least one of viewport/browser/environment is required',
  })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  @ApiOkResponse({
    description: 'PDF file streamed with Content-Disposition attachment',
  })
  @ApiNotFoundResponse({ description: 'PDF not found' })
  async downloadPdf(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query('type') type: string,
    @Res() res: Response,
    @Query('viewport') viewport?: string,
    @Query('browser') browser?: string,
    @Query('environment') environment?: string,
  ) {
    const { buffer, filename, contentType } = await this.pdfAccess.download(
      projectName,
      testName,
      type,
      { viewport, browser, environment },
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
