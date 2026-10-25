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
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { PublicEndpoint } from '@common/http/public.decorator';
import { SessionOnly } from '@common/http/session-only.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import {
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@common/http/session-cookie';
import { AppConfigService } from '@config/app-config.service';
import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  DisableTotpDto,
  EnableTotpDto,
  RecoveryCodesDto,
  SessionDto,
  TwoFactorChallengeDto,
  TwoFactorSetupDto,
  VerifyTwoFactorDto,
} from './dto/two-factor.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly appConfig: AppConfigService,
  ) {}

  @PublicEndpoint()
  @Post('login')
  @RateLimit('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'A session user, or a two-factor challenge when 2FA is enabled',
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/MeDto' },
        { $ref: '#/components/schemas/TwoFactorChallengeDto' },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto | TwoFactorChallengeDto> {
    const result = await this.authService.login(dto.username, dto.password, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    if ('twoFactorRequired' in result) {
      return result;
    }
    res.cookie(
      SESSION_COOKIE,
      result.token,
      sessionCookieOptions(this.appConfig.auth.cookieSecure || req.secure),
    );
    return {
      username: result.username,
      role: result.role,
      mustChangePassword: result.mustChangePassword,
      totpEnabled: result.totpEnabled,
    };
  }

  @PublicEndpoint()
  @Post('2fa/verify')
  @RateLimit('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired 2FA code' })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const result = await this.authService.verifyTwoFactor(
      dto.challengeToken,
      dto.code,
      {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
    res.cookie(
      SESSION_COOKIE,
      result.token,
      sessionCookieOptions(this.appConfig.auth.cookieSecure || req.secure),
    );
    return {
      username: result.username,
      role: result.role,
      mustChangePassword: result.mustChangePassword,
      totpEnabled: result.totpEnabled,
    };
  }

  @SessionOnly()
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TwoFactorSetupDto })
  async setupTwoFactor(
    @Req() req: AuthenticatedRequest,
  ): Promise<TwoFactorSetupDto> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    const setup = await this.authService.startTotpSetup(auth.userId);
    return plainToInstance(TwoFactorSetupDto, setup, {
      excludeExtraneousValues: true,
    });
  }

  @SessionOnly()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async enableTwoFactor(
    @Body() dto: EnableTotpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RecoveryCodesDto> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    const recoveryCodes = await this.authService.enableTotp(
      auth.userId,
      dto.code,
    );
    return plainToInstance(
      RecoveryCodesDto,
      { recoveryCodes },
      { excludeExtraneousValues: true },
    );
  }

  @SessionOnly()
  @Post('2fa/disable')
  @RateLimit('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Two-factor authentication disabled' })
  async disableTwoFactor(
    @Body() dto: DisableTotpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    await this.authService.disableTotp(auth.userId, dto.password);
  }

  @SessionOnly()
  @Get('sessions')
  @ApiOkResponse({ type: [SessionDto] })
  async listSessions(@Req() req: AuthenticatedRequest): Promise<SessionDto[]> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    const sessions = await this.authService.listSessions(
      auth.userId,
      auth.sessionId,
    );
    return plainToInstance(SessionDto, sessions, {
      excludeExtraneousValues: true,
    });
  }

  @SessionOnly()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Session revoked' })
  async revokeSession(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    await this.authService.revokeSession(auth.userId, id);
  }

  @SessionOnly()
  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ schema: { example: { revoked: 2 } } })
  async revokeAllSessions(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ revoked: number }> {
    const auth = req.auth;
    if (!auth?.userId)
      throw new UnauthorizedException('Authentication required');
    const revoked = await this.authService.revokeOtherSessions(
      auth.userId,
      auth.sessionId,
    );
    return { revoked };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity('apiKeyAuth')
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Session cleared',
  })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readSessionToken(req.headers.cookie);
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @ApiSecurity('apiKeyAuth')
  @ApiOkResponse({ type: MeDto })
  me(@Req() req: AuthenticatedRequest): MeDto {
    // The global guard attaches auth to every non-public route.
    const auth = req.auth;
    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      username: auth.username,
      role: auth.role,
      mustChangePassword: auth.mustChangePassword ?? false,
      totpEnabled: auth.totpEnabled ?? false,
    };
  }

  @SessionOnly()
  @Post('change-password')
  @RateLimit('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const auth = req.auth;
    if (!auth?.userId) {
      throw new UnauthorizedException('Authentication required');
    }
    const { token } = await this.authService.changePassword(
      auth.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    res.cookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(this.appConfig.auth.cookieSecure || req.secure),
    );
    return {
      username: auth.username,
      role: auth.role,
      mustChangePassword: false,
      totpEnabled: auth.totpEnabled ?? false,
    };
  }
}
