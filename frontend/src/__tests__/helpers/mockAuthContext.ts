import { vi } from 'vitest';

interface MockAuthOverrides {
  user?: { id?: number; nickname?: string; email?: string } | null;
  openAuthModal?: ReturnType<typeof vi.fn>;
  token?: string | null;
  isLoading?: boolean;
}

/**
 * AuthContext useAuth mock 기본값을 생성한다.
 * 테스트별로 필요한 필드만 override할 수 있다.
 */
export function createMockAuth(overrides: MockAuthOverrides = {}) {
  return {
    user: overrides.user ?? null,
    token: overrides.token ?? null,
    isLoading: overrides.isLoading ?? false,
    isLoggingOut: false,
    logoutError: null,
    logout: vi.fn(),
    handleAuthSuccess: vi.fn(),
    updateUser: vi.fn(),
    openAuthModal: overrides.openAuthModal ?? vi.fn(),
    closeAuthModal: vi.fn(),
    clearLogoutError: vi.fn(),
    authModal: { isOpen: false },
  };
}
