import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthReturnPath,
  storeCurrentAuthReturnPath,
  validateAuthReturnPath,
} from '@/lib/auth-return-path';

const AUTH_RETURN_PATH_KEY = 'filmott_auth_return_path';

describe('auth return path', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('현재 same-origin 상대 경로의 query와 hash를 함께 저장해야 한다', () => {
    window.history.replaceState(
      {},
      '',
      '/contents/123?tab=reviews#comments',
    );

    storeCurrentAuthReturnPath();

    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBe(
      '/contents/123?tab=reviews#comments',
    );
  });

  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    'javascript:alert(1)',
    '/auth/callback',
    '/auth/callback/extra?status=success',
    '/..//attacker.example',
    '/contents/../..//attacker.example',
  ])('안전하지 않은 복귀 경로 %s는 /로 대체해야 한다', (path) => {
    expect(validateAuthReturnPath(path)).toBe('/');
  });

  it('저장 경로를 한 번 소비한 뒤 제거해야 한다', () => {
    window.sessionStorage.setItem(
      AUTH_RETURN_PATH_KEY,
      '/search?q=movie#results',
    );

    expect(consumeAuthReturnPath()).toBe('/search?q=movie#results');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBeNull();
    expect(consumeAuthReturnPath()).toBe('/');
  });

  it('저장값이 없거나 오염됐으면 제거하고 /를 반환해야 한다', () => {
    expect(consumeAuthReturnPath()).toBe('/');

    window.sessionStorage.setItem(
      AUTH_RETURN_PATH_KEY,
      'https://attacker.example/path',
    );
    expect(consumeAuthReturnPath()).toBe('/');
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBeNull();
  });

  it('sessionStorage 저장이 차단돼도 예외를 전파하지 않아야 한다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => storeCurrentAuthReturnPath()).not.toThrow();
  });

  it('sessionStorage 읽기 또는 제거가 차단되면 /로 대체해야 한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(consumeAuthReturnPath()).toBe('/');

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(consumeAuthReturnPath()).toBe('/');
  });
});
