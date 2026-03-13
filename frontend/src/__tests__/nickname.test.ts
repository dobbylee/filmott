import { describe, it, expect } from 'vitest';
import {
  NICKNAME_REGEX,
  NICKNAME_MAX_BYTES,
  NICKNAME_RESERVED,
  getNicknameByteLength,
  validateNickname,
} from '@/utils/nickname';

describe('getNicknameByteLength', () => {
  it('ASCII 문자를 각 1바이트로 계산해야 한다', () => {
    expect(getNicknameByteLength('abc')).toBe(3);
    expect(getNicknameByteLength('hello123')).toBe(8);
  });

  it('한글 문자를 각 2바이트로 계산해야 한다', () => {
    expect(getNicknameByteLength('가나다')).toBe(6);
    expect(getNicknameByteLength('한글')).toBe(4);
  });

  it('혼합 문자를 올바르게 계산해야 한다', () => {
    expect(getNicknameByteLength('abc가나')).toBe(7);
    expect(getNicknameByteLength('user_한글')).toBe(9);
  });

  it('빈 문자열에 대해 0을 반환해야 한다', () => {
    expect(getNicknameByteLength('')).toBe(0);
  });

  it('한글 자모를 각 2바이트로 계산해야 한다', () => {
    expect(getNicknameByteLength('ㄱㄴㄷ')).toBe(6);
  });
});

describe('validateNickname', () => {
  it('2자 미만 닉네임을 거부해야 한다', () => {
    expect(validateNickname('a')).toBe('닉네임은 2자 이상이어야 합니다.');
    expect(validateNickname('')).toBe('닉네임은 2자 이상이어야 합니다.');
  });

  it('유효하지 않은 문자가 포함된 닉네임을 거부해야 한다', () => {
    expect(validateNickname('ab@c')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
    expect(validateNickname('ab!c')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
    expect(validateNickname('ab-cd')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
  });

  it('최대 바이트를 초과하는 닉네임을 거부해야 한다', () => {
    // 9 Korean characters = 18 bytes > 16
    expect(validateNickname('가나다라마바사아자')).toBe('닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)');
    // 17 ASCII characters > 16
    expect(validateNickname('abcdefghijklmnopq')).toBe('닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)');
  });

  it('예약된 닉네임을 거부해야 한다', () => {
    for (const reserved of NICKNAME_RESERVED) {
      expect(validateNickname(reserved)).toBe('사용할 수 없는 닉네임입니다.');
    }
    // case-insensitive check
    expect(validateNickname('Admin123')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('FILMOTT')).toBe('사용할 수 없는 닉네임입니다.');
  });

  it('예약어로 시작하는 닉네임을 거부해야 한다', () => {
    expect(validateNickname('adminUser')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('filmott99')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('deletedUser')).toBe('사용할 수 없는 닉네임입니다.');
  });

  it('유효한 닉네임에 대해 null을 반환해야 한다', () => {
    expect(validateNickname('ab')).toBeNull();
    expect(validateNickname('user123')).toBeNull();
    expect(validateNickname('유저이름')).toBeNull();
    expect(validateNickname('my_name')).toBeNull();
    expect(validateNickname('한글abc123')).toBeNull();
  });

  it('정확히 최대 바이트인 닉네임을 허용해야 한다', () => {
    // 8 Korean characters = 16 bytes = exactly max
    expect(validateNickname('가나다라마바사아')).toBeNull();
    // 16 ASCII characters = 16 bytes = exactly max
    expect(validateNickname('abcdefghijklmnop')).toBeNull();
  });
});

describe('상수', () => {
  it('NICKNAME_REGEX가 유효한 패턴과 매칭되어야 한다', () => {
    expect(NICKNAME_REGEX.test('abc')).toBe(true);
    expect(NICKNAME_REGEX.test('가나다')).toBe(true);
    expect(NICKNAME_REGEX.test('abc123')).toBe(true);
    expect(NICKNAME_REGEX.test('user_name')).toBe(true);
  });

  it('NICKNAME_REGEX가 유효하지 않은 패턴을 거부해야 한다', () => {
    expect(NICKNAME_REGEX.test('ab c')).toBe(false);
    expect(NICKNAME_REGEX.test('ab@c')).toBe(false);
    expect(NICKNAME_REGEX.test('')).toBe(false);
  });

  it('NICKNAME_MAX_BYTES가 16이어야 한다', () => {
    expect(NICKNAME_MAX_BYTES).toBe(16);
  });

  it('NICKNAME_RESERVED가 예상 단어를 포함해야 한다', () => {
    expect(NICKNAME_RESERVED).toContain('admin');
    expect(NICKNAME_RESERVED).toContain('filmott');
    expect(NICKNAME_RESERVED).toContain('deleted');
  });
});
