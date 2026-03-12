import { describe, it, expect } from 'vitest';
import { getDisplayNickname, isDeletedUser } from '@/utils/user';

describe('getDisplayNickname', () => {
  it('should return nickname for active user', () => {
    expect(getDisplayNickname({ nickname: 'testuser', status: 'ACTIVE' })).toBe('testuser');
  });

  it('should return "탈퇴한 사용자" for deleted user', () => {
    expect(getDisplayNickname({ nickname: 'deleted_123', status: 'DELETED' })).toBe('탈퇴한 사용자');
  });

  it('should return "정지된 사용자" for suspended user', () => {
    expect(getDisplayNickname({ nickname: 'baduser', status: 'SUSPENDED' })).toBe('정지된 사용자');
  });

  it('should return "알 수 없음" for null user', () => {
    expect(getDisplayNickname(null)).toBe('알 수 없음');
  });

  it('should return "알 수 없음" for undefined user', () => {
    expect(getDisplayNickname(undefined)).toBe('알 수 없음');
  });

  it('should return "알 수 없음" when nickname is missing', () => {
    expect(getDisplayNickname({ status: 'ACTIVE' })).toBe('알 수 없음');
  });

  it('should return nickname when status is not set', () => {
    expect(getDisplayNickname({ nickname: 'testuser' })).toBe('testuser');
  });
});

describe('isDeletedUser', () => {
  it('should return true for deleted user', () => {
    expect(isDeletedUser({ status: 'DELETED' })).toBe(true);
  });

  it('should return false for active user', () => {
    expect(isDeletedUser({ status: 'ACTIVE' })).toBe(false);
  });

  it('should return false for suspended user', () => {
    expect(isDeletedUser({ status: 'SUSPENDED' })).toBe(false);
  });

  it('should return false for null user', () => {
    expect(isDeletedUser(null)).toBe(false);
  });

  it('should return false for undefined user', () => {
    expect(isDeletedUser(undefined)).toBe(false);
  });

  it('should return false when status is not set', () => {
    expect(isDeletedUser({})).toBe(false);
  });
});
