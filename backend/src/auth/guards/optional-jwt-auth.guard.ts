import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    // 토큰이 없으면 인증 스킵 → null user로 통과
    if (!authHeader) {
      request.user = null;
      return true;
    }

    // 토큰이 있으면 기존 JWT 검증 수행
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<T>(err: Error | null, user: T): T | null {
    // 토큰 검증 실패(만료 등) 시 에러 던지지 않고 null 반환
    if (err || !user) {
      return null;
    }
    return user;
  }
}
