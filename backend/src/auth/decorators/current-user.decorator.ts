import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// Custom decorator to extract the authenticated user from the request
// Usage: @CurrentUser() user: JwtPayload
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);

// Type returned by JwtStrategy.validate()
export interface JwtPayload {
  id: number;
  username: string;
}
