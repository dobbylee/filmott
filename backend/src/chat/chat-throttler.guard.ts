import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

const ANONYMOUS_LIMIT = 5;

interface ChatThrottleRequest {
  ip?: string;
  user?: {
    id?: number;
  } | null;
}

@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: ChatThrottleRequest): Promise<string> {
    // 로그인 유저: userId 기반, 비로그인: IP 기반
    if (req.user?.id) {
      return Promise.resolve(`user-${req.user.id}`);
    }
    return Promise.resolve(`ip-${req.ip ?? 'unknown'}`);
  }

  protected handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context } = requestProps;
    const req = context.switchToHttp().getRequest<ChatThrottleRequest>();

    // 비로그인 유저는 limit을 5로 제한
    if (!req.user?.id) {
      return super.handleRequest({
        ...requestProps,
        limit: ANONYMOUS_LIMIT,
      });
    }

    return super.handleRequest(requestProps);
  }

  protected getErrorMessage(): Promise<string> {
    return Promise.resolve('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
}
