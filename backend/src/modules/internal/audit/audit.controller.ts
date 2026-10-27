import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Roles } from '@common/http/roles.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import {
  createPaginatedResponse,
  PaginatedResponseDto,
} from '@common/dto/paginated-response.dto';
import { AuditService } from '@internal/audit/audit.service';
import {
  AuditEventDto,
  AuditExportQueryDto,
  AuditQueryDto,
} from '@internal/audit/audit.dto';

// The global audit trail: every project, newest first. Reads require a browser
// session, not merely the ADMIN role: the trail names every actor and action in
// the deployment, so a long-lived CI key must not be able to read it (ADR-035).
// Writes are performed by the owning services, never by an HTTP caller.
@ApiTags('Audit')
@Controller('audit')
@SessionOnly()
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit events (newest first, paginated)' })
  @ApiOkResponse({ type: PaginatedResponseDto(AuditEventDto) })
  async list(@Query() query: AuditQueryDto) {
    const page = Math.floor(query.skip / query.take) + 1;
    const result = await this.audit.list(
      {
        ...(query.actor ? { actor: query.actor } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.projectName ? { projectName: query.projectName } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
      },
      query.skip,
      query.take,
    );
    const meta = createPaginatedResponse(
      [],
      page,
      query.take,
      result.total,
    ).meta;
    return {
      data: plainToInstance(AuditEventDto, result.data, {
        excludeExtraneousValues: true,
      }),
      meta,
    };
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit.csv"')
  @ApiOperation({ summary: 'Export the filtered audit trail as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV document' })
  async export(@Query() query: AuditExportQueryDto): Promise<string> {
    return this.audit.exportCsv({
      ...(query.actor ? { actor: query.actor } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.projectName ? { projectName: query.projectName } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
  }
}
