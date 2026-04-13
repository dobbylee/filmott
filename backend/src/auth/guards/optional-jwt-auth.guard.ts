import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_ACCESS_TOKEN_COOKIE } from '../auth-cookie.util';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!this.hasCredentials(request)) {
      request.user = null;
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
    const request = context.switchToHttp().getRequest();

    if (!this.hasCredentials(request)) {
      request.user = null;
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

  private hasCredentials(request: {
    headers?: { authorization?: string };
    cookies?: Record<string, string | undefined>;
  }): boolean {
    const authHeader = request.headers?.authorization;
    const accessCookie = request.cookies?.[AUTH_ACCESS_TOKEN_COOKIE];

    return (
      (typeof authHeader === 'string' && authHeader.length > 0) ||
      (typeof accessCookie === 'string' && accessCookie.length > 0)
    );
  }
}
