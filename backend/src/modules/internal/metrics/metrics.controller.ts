import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicEndpoint } from '@common/http/public.decorator';
import { GlobalRoute } from '@common/http/project-route.decorator';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';
@ApiTags('Metrics')
@PublicEndpoint()
@GlobalRoute()
@Controller('metrics')
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOkResponse({ description: 'Prometheus metrics' })
  async getMetrics(): Promise<string> {
    return this.metrics.getPrometheusMetrics();
  }
}
