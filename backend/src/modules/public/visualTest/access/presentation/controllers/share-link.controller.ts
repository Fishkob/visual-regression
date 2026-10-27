import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { PublicEndpoint } from '@common/http/public.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';
import { ShareLinkService } from '@public/visualTest/access/application/share-link.service';
import {
  CreateShareLinkDto,
  CreatedShareLinkDto,
  PublicShareDto,
  ResolveShareDto,
  ShareLinkDto,
} from '@public/visualTest/access/presentation/dto/share-link.dto';

@ApiTags('Share links')
@Controller('projects/:projectName/share-links')
@SessionOnly()
export class ShareLinksController {
  constructor(private readonly shares: ShareLinkService) {}

  @Scope('read')
  @Get()
  @ApiOperation({ summary: 'List share links for a project' })
  @ApiOkResponse({ type: [ShareLinkDto] })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
  ): Promise<ShareLinkDto[]> {
    const links = await this.shares.list(projectName);
    return plainToInstance(ShareLinkDto, links, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Post()
  @ApiOperation({ summary: 'Create a read-only, expiring share link' })
  @ApiCreatedResponse({ type: CreatedShareLinkDto })
  async create(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: CreateShareLinkDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreatedShareLinkDto> {
    const created = await this.shares.create(
      projectName,
      dto,
      requireActor(req),
    );
    return plainToInstance(
      CreatedShareLinkDto,
      {
        ...created,
        link: created.link,
      },
      { excludeExtraneousValues: true },
    );
  }
}

@ApiTags('Share links')
@Controller('share-links')
@SessionOnly()
export class ShareLinkRevokeController {
  constructor(private readonly shares: ShareLinkService) {}

  @Scope('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a share link' })
  @ApiOkResponse({ type: ShareLinkDto })
  async revoke(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShareLinkDto> {
    const revoked = await this.shares.revoke(id, requireActor(req));
    return plainToInstance(ShareLinkDto, revoked, {
      excludeExtraneousValues: true,
    });
  }
}

@ApiTags('Share links')
@Controller('public/shares')
export class PublicShareController {
  constructor(private readonly shares: ShareLinkService) {}

  @PublicEndpoint()
  @Post(':token')
  @RateLimit('login')
  @ApiOperation({
    summary: 'Resolve a share token (optional passphrase) to a read-only view',
  })
  @ApiOkResponse({ type: PublicShareDto })
  async resolve(
    @Param('token') token: string,
    @Body() dto: ResolveShareDto,
    @Req() req: Request,
  ): Promise<PublicShareDto> {
    const payload = await this.shares.resolve(token, dto.passphrase, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return plainToInstance(PublicShareDto, payload, {
      excludeExtraneousValues: true,
    });
  }
}
