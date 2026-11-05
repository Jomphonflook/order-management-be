import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SafeUser } from '../users/users.service.js';

export type AuthenticatedRequest = Request & { user: SafeUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = await this.authService.authenticateToken(token);
    return true;
  }
}
