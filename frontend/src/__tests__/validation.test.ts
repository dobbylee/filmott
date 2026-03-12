import { validatePassword } from '@/utils/validation';

describe('validatePassword', () => {
  it('should return error for passwords shorter than 8 characters', () => {
    expect(validatePassword('Ab1!xyz')).toBe('비밀번호는 8자 이상이어야 합니다.');
  });

  it('should return error when missing letters', () => {
    expect(validatePassword('12345678!')).toBe('영문을 포함해야 합니다.');
  });

  it('should return error when missing digits', () => {
    expect(validatePassword('abcdefgh!')).toBe('숫자를 포함해야 합니다.');
  });

  it('should return error when missing special characters', () => {
    expect(validatePassword('abcdefg1')).toBe('특수문자를 포함해야 합니다.');
  });

  it('should return null for valid password', () => {
    expect(validatePassword('Password1!')).toBeNull();
  });

  it('should accept various special characters', () => {
    expect(validatePassword('Abcdefg1@')).toBeNull();
    expect(validatePassword('Abcdefg1#')).toBeNull();
    expect(validatePassword('Abcdefg1$')).toBeNull();
    expect(validatePassword('Abcdefg1%')).toBeNull();
    expect(validatePassword('Abcdefg1^')).toBeNull();
    expect(validatePassword('Abcdefg1&')).toBeNull();
  });

  it('should return null for empty string (length check catches it)', () => {
    expect(validatePassword('')).toBe('비밀번호는 8자 이상이어야 합니다.');
  });
});
