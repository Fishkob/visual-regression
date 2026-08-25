import {
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicEndpoint } from '@common/http/public.decorator';
import { DlqService } from './dlq.service';
import { AdminAuthGuard } from './admin-auth.guard';

// Deliberately outside the product API surface (spec: "narrower than the
// global guard, not part of the product API surface"): only AdminAuthGuard
// applies.
@ApiTags('DLQ')
@PublicEndpoint()
@Controller('admin/dlq')
@UseGuards(AdminAuthGuard)
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  @ApiOkResponse({ description: 'List of failed jobs in the DLQ' })
  async listFailedJobs() {
    const data = await this.dlqService.listFailedJobs();
    return { data };
  }

  @Post(':id/retry')
  @HttpCode(204)
  @ApiOkResponse({ description: 'Job retried successfully' })
  async retryJob(@Param('id') id: string): Promise<void> {
    await this.dlqService.retryJob(id);
  }
}
