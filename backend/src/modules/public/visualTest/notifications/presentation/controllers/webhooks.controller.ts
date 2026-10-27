import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { SessionOnly } from '@common/http/session-only.decorator';
import { Roles } from '@common/http/roles.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { WebhookSettingsService } from '@public/visualTest/notifications/application/webhook-settings.service';
import {
  CreateWebhookDto,
  CreatedWebhookEndpointDto,
  UpdateWebhookDto,
  WebhookDeliveryDto,
  WebhookEndpointDto,
  WebhookReplayResultDto,
  WebhookTestResultDto,
} from '@public/visualTest/notifications/presentation/dto/webhook.dto';

// Project-scoped webhook administration. Session-only and ADMIN-only: an API
// key (the CI credential) cannot read or edit endpoints, and a MEMBER/VIEWER
// session cannot exfiltrate review notifications.
@ApiTags('Webhooks')
@Controller('projects/:projectName/webhooks')
@SessionOnly()
@Roles('ADMIN')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookSettingsService) {}

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List the project webhook endpoints' })
  @ApiOkResponse({ type: [WebhookEndpointDto] })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
  ) {
    const rows = await this.webhooks.list(projectName);
    return plainToInstance(WebhookEndpointDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Post()
  @ApiOperation({
    summary: 'Create a webhook endpoint and reveal its signing secret once',
  })
  @ApiBody({ type: CreateWebhookDto })
  @ApiCreatedResponse({ type: CreatedWebhookEndpointDto })
  async create(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: CreateWebhookDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const created = await this.webhooks.create(
      projectName,
      dto,
      requireActor(req),
    );
    return plainToInstance(CreatedWebhookEndpointDto, created, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update, disable or rotate the secret of a webhook endpoint',
  })
  @ApiBody({ type: UpdateWebhookDto })
  @ApiOkResponse({ type: WebhookEndpointDto })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.webhooks.update(
      projectName,
      id,
      dto,
      requireActor(req),
    );
    const dtoClass = updated.secret
      ? CreatedWebhookEndpointDto
      : WebhookEndpointDto;
    return plainToInstance(dtoClass, updated, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a webhook endpoint and its delivery log' })
  @ApiNoContentResponse()
  async remove(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.webhooks.remove(projectName, id, requireActor(req));
  }

  @Scope('read')
  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List the recent deliveries of an endpoint' })
  @ApiOkResponse({ type: [WebhookDeliveryDto] })
  async deliveries(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('id') id: string,
  ) {
    const rows = await this.webhooks.listDeliveries(projectName, id);
    return plainToInstance(WebhookDeliveryDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Post(':id/deliveries/:deliveryId/replay')
  @HttpCode(202)
  @ApiOperation({ summary: 'Requeue a delivery for the dispatcher' })
  @ApiOkResponse({ type: WebhookReplayResultDto })
  async replay(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    await this.webhooks.replay(projectName, id, deliveryId);
    return { queued: true };
  }

  @Scope('admin')
  @Post(':id/test')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue a synthetic test delivery' })
  @ApiOkResponse({ type: WebhookTestResultDto })
  async test(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('id') id: string,
  ) {
    await this.webhooks.sendTest(projectName, id);
    return { queued: true };
  }
}
