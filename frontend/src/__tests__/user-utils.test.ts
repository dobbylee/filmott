import { describe, it, expect } from 'vitest';
import { getDisplayNickname, isDeletedUser } from '@/utils/user';

describe('getDisplayNickname', () => {
  it('활성 사용자의 닉네임을 반환해야 한다', () => {
    expect(getDisplayNickname({ nickname: 'testuser', status: 'ACTIVE' })).toBe('testuser');
  });

  it('탈퇴한 사용자에 대해 "탈퇴한 사용자"를 반환해야 한다', () => {
    expect(getDisplayNickname({ nickname: 'deleted_123', status: 'DELETED' })).toBe('탈퇴한 사용자');
  });

  it('정지된 사용자에 대해 "정지된 사용자"를 반환해야 한다', () => {
    expect(getDisplayNickname({ nickname: 'baduser', status: 'SUSPENDED' })).toBe('정지된 사용자');
  });

  it('null 사용자에 대해 "알 수 없음"을 반환해야 한다', () => {
    expect(getDisplayNickname(null)).toBe('알 수 없음');
  });

  it('undefined 사용자에 대해 "알 수 없음"을 반환해야 한다', () => {
    expect(getDisplayNickname(undefined)).toBe('알 수 없음');
  });

  it('닉네임이 없을 때 "알 수 없음"을 반환해야 한다', () => {
    expect(getDisplayNickname({ status: 'ACTIVE' })).toBe('알 수 없음');
  });

  it('status가 설정되지 않았을 때 닉네임을 반환해야 한다', () => {
    expect(getDisplayNickname({ nickname: 'testuser' })).toBe('testuser');
  });
});

describe('isDeletedUser', () => {
  it('탈퇴한 사용자에 대해 true를 반환해야 한다', () => {
    expect(isDeletedUser({ status: 'DELETED' })).toBe(true);
  });

  it('활성 사용자에 대해 false를 반환해야 한다', () => {
    expect(isDeletedUser({ status: 'ACTIVE' })).toBe(false);
  });

  it('정지된 사용자에 대해 false를 반환해야 한다', () => {
    expect(isDeletedUser({ status: 'SUSPENDED' })).toBe(false);
  });

  it('null 사용자에 대해 false를 반환해야 한다', () => {
    expect(isDeletedUser(null)).toBe(false);
  });

  it('undefined 사용자에 대해 false를 반환해야 한다', () => {
    expect(isDeletedUser(undefined)).toBe(false);
  });

  it('status가 설정되지 않았을 때 false를 반환해야 한다', () => {
    expect(isDeletedUser({})).toBe(false);
  });
});
