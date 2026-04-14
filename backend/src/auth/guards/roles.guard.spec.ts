import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (role?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 1, nickname: 'test', role } }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('@Roles 데코레이터가 설정되지 않으면 접근을 허용해야 한다', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext(UserRole.USER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('@Roles가 빈 배열이면 접근을 허용해야 한다', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockContext(UserRole.USER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('사용자가 필요한 역할을 가지고 있으면 접근을 허용해야 한다', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(UserRole.ADMIN);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('사용자가 필요한 역할을 가지고 있지 않으면 접근을 거부해야 한다', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(UserRole.USER);

    expect(guard.canActivate(context)).toBe(false);
  });

  it('사용자가 여러 필수 역할 중 하나를 가지고 있으면 접근을 허용해야 한다', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.USER, UserRole.ADMIN]);
    const context = createMockContext(UserRole.USER);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('사용자에게 역할이 없으면 접근을 거부해야 한다', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(undefined);

    expect(guard.canActivate(context)).toBe(false);
  });
});
