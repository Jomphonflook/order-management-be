import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { SafeUser } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { LoginDto } from './dto/login.dto.js';

const AUTH_COOKIE = 'access_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: SafeUser }> {
    const { user, token } = await this.authService.login(dto);
    response.cookie(AUTH_COOKIE, token, this.cookieOptions());
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { success: true } {
    const { maxAge: _maxAge, ...clearOptions } = this.cookieOptions();
    response.clearCookie(AUTH_COOKIE, clearOptions);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Req() request: AuthenticatedRequest): SafeUser {
    return request.user;
  }

  private cookieOptions() {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    };
  }
}
