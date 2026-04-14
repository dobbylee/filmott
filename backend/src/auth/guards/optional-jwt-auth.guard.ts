import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AUTH_ACCESS_TOKEN_COOKIE } from '../auth-cookie.util';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.hasCredentials(request)) {
      this.markAsAnonymous(request);
      return true;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<T>(
    err: Error | null,
    user: T,
    _info: unknown,
    context: ExecutionContext,
  ): T | null {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.hasCredentials(request)) {
      this.markAsAnonymous(request);
      return null;
    }

    if (err) {
      throw err;
    }

    if (!user) {
      throw new UnauthorizedException('유효하지 않은 인증 정보입니다.');
    }

    return user;
  }

  private hasCredentials(request: Request): boolean {
    const authHeader = request.headers?.authorization;
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const accessCookie = cookies?.[AUTH_ACCESS_TOKEN_COOKIE];

    return (
      (typeof authHeader === 'string' && authHeader.length > 0) ||
      (typeof accessCookie === 'string' && accessCookie.length > 0)
    );
  }

  private markAsAnonymous(request: Request): void {
    (request as unknown as { user?: null }).user = null;
  }
}
