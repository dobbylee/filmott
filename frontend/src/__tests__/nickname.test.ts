import { describe, it, expect } from 'vitest';
import {
  NICKNAME_REGEX,
  NICKNAME_MAX_BYTES,
  NICKNAME_RESERVED,
  getNicknameByteLength,
  validateNickname,
} from '@/utils/nickname';

describe('getNicknameByteLength', () => {
  it('should count ASCII characters as 1 byte each', () => {
    expect(getNicknameByteLength('abc')).toBe(3);
    expect(getNicknameByteLength('hello123')).toBe(8);
  });

  it('should count Korean characters as 2 bytes each', () => {
    expect(getNicknameByteLength('가나다')).toBe(6);
    expect(getNicknameByteLength('한글')).toBe(4);
  });

  it('should count mixed characters correctly', () => {
    expect(getNicknameByteLength('abc가나')).toBe(7);
    expect(getNicknameByteLength('user_한글')).toBe(9);
  });

  it('should return 0 for empty string', () => {
    expect(getNicknameByteLength('')).toBe(0);
  });

  it('should count Korean consonants/vowels (jamo) as 2 bytes', () => {
    expect(getNicknameByteLength('ㄱㄴㄷ')).toBe(6);
  });
});

describe('validateNickname', () => {
  it('should reject nicknames shorter than 2 characters', () => {
    expect(validateNickname('a')).toBe('닉네임은 2자 이상이어야 합니다.');
    expect(validateNickname('')).toBe('닉네임은 2자 이상이어야 합니다.');
  });

  it('should reject nicknames with invalid characters', () => {
    expect(validateNickname('ab@c')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
    expect(validateNickname('ab!c')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
    expect(validateNickname('ab-cd')).toBe('한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
  });

  it('should reject nicknames exceeding max bytes', () => {
    // 9 Korean characters = 18 bytes > 16
    expect(validateNickname('가나다라마바사아자')).toBe('닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)');
    // 17 ASCII characters > 16
    expect(validateNickname('abcdefghijklmnopq')).toBe('닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)');
  });

  it('should reject reserved nicknames', () => {
    for (const reserved of NICKNAME_RESERVED) {
      expect(validateNickname(reserved)).toBe('사용할 수 없는 닉네임입니다.');
    }
    // case-insensitive check
    expect(validateNickname('Admin123')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('FILMOTT')).toBe('사용할 수 없는 닉네임입니다.');
  });

  it('should reject nicknames starting with reserved words', () => {
    expect(validateNickname('adminUser')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('filmott99')).toBe('사용할 수 없는 닉네임입니다.');
    expect(validateNickname('deletedUser')).toBe('사용할 수 없는 닉네임입니다.');
  });

  it('should return null for valid nicknames', () => {
    expect(validateNickname('ab')).toBeNull();
    expect(validateNickname('user123')).toBeNull();
    expect(validateNickname('유저이름')).toBeNull();
    expect(validateNickname('my_name')).toBeNull();
    expect(validateNickname('한글abc123')).toBeNull();
  });

  it('should accept nicknames at exactly max bytes', () => {
    // 8 Korean characters = 16 bytes = exactly max
    expect(validateNickname('가나다라마바사아')).toBeNull();
    // 16 ASCII characters = 16 bytes = exactly max
    expect(validateNickname('abcdefghijklmnop')).toBeNull();
  });
});

describe('constants', () => {
  it('NICKNAME_REGEX should match valid patterns', () => {
    expect(NICKNAME_REGEX.test('abc')).toBe(true);
    expect(NICKNAME_REGEX.test('가나다')).toBe(true);
    expect(NICKNAME_REGEX.test('abc123')).toBe(true);
    expect(NICKNAME_REGEX.test('user_name')).toBe(true);
  });

  it('NICKNAME_REGEX should reject invalid patterns', () => {
    expect(NICKNAME_REGEX.test('ab c')).toBe(false);
    expect(NICKNAME_REGEX.test('ab@c')).toBe(false);
    expect(NICKNAME_REGEX.test('')).toBe(false);
  });

  it('NICKNAME_MAX_BYTES should be 16', () => {
    expect(NICKNAME_MAX_BYTES).toBe(16);
  });

  it('NICKNAME_RESERVED should contain expected words', () => {
    expect(NICKNAME_RESERVED).toContain('admin');
    expect(NICKNAME_RESERVED).toContain('filmott');
    expect(NICKNAME_RESERVED).toContain('deleted');
  });
});
