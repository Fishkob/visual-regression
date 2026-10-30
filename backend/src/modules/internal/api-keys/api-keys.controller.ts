import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { SessionOnly } from '@common/http/session-only.decorator';
import { Roles } from '@common/http/roles.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { ApiKeyService, type ApiKeyView } from '@internal/auth/api-key.service';
import {
  ApiKeyDto,
  RevokeApiKeyDto,
  RotateApiKeyDto,
} from '@internal/auth/dto/api-key.dto';
import {
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from '@internal/auth/dto/create-api-key.dto';

// Key management is a human task: it is reachable with the browser session
// only (@SessionOnly), so a leaked CI key cannot mint, rotate, or revoke keys
// for the whole platform. Bootstrap provisioning stays on POST /admin/api-keys
// (x-admin-key) so a first key exists before any session does.
@ApiTags('API Keys')
@Controller('api-keys')
@SessionOnly()
@Roles('ADMIN')
@ApiForbiddenResponse({
  description: 'API-key callers cannot manage keys; log in instead',
})
export class ApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys (hashes are never returned)' })
  @ApiOkResponse({ type: [ApiKeyDto] })
  async findAll(): Promise<ApiKeyDto[]> {
    const rows = await this.apiKeyService.listKeys();
    return rows.map((row) => this.toDto(row));
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key and reveal it once' })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async create(
    @Body() dto: CreateApiKeyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreatedApiKeyDto> {
    const issued = await this.apiKeyService.createKey(requireActor(req), {
      name: dto.name,
      expiresInDays: dto.expiresInDays ?? null,
      createdBy: req.auth?.username ?? null,
      ownerId: req.auth?.userId ?? null,
      scopes: dto.scopes,
      projectNames: dto.projectNames,
    });
    return plainToInstance(CreatedApiKeyDto, issued, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':id/rotate')
  @ApiOperation({
    summary: 'Replace a key with a new one, retiring the previous key',
  })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async rotate(
    @Param('id') id: string,
    @Body() dto: RotateApiKeyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreatedApiKeyDto> {
    const issued = await this.apiKeyService.rotateKey(requireActor(req), id, {
      graceMinutes: dto.graceMinutes,
      // Passed through untouched: the rotation's expiry is a three-way choice —
      // omitted inherits the predecessor's remaining lifetime, null means the
      // successor never expires, a number sets that lifetime.
      expiresInDays: dto.expiresInDays,
      createdBy: req.auth?.username ?? null,
    });
    return plainToInstance(CreatedApiKeyDto, issued, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a key; the row stays for the audit trail' })
  @ApiOkResponse({ type: ApiKeyDto })
  async revoke(
    @Param('id') id: string,
    @Body() dto: RevokeApiKeyDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiKeyDto> {
    const row = await this.apiKeyService.revokeKey(
      requireActor(req),
      id,
      dto.reason ?? null,
    );
    return this.toDto(row);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a key permanently; it stops authenticating immediately',
  })
  @ApiOkResponse({ description: 'Key deleted' })
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    return this.apiKeyService.deleteKey(requireActor(req), id);
  }

  private toDto(row: ApiKeyView): ApiKeyDto {
    return plainToInstance(ApiKeyDto, row, { excludeExtraneousValues: true });
  }
}
