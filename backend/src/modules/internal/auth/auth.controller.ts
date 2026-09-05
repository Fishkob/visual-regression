import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PublicEndpoint } from '@common/http/public.decorator';
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
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { token, username } = await this.authService.login(
      dto.username,
      dto.password,
    );
    res.cookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(this.appConfig.auth.cookieSecure),
    );
    return { username };
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
    return { username: auth.username };
  }
}
