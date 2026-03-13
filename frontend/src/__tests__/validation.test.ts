import { validatePassword } from '@/utils/validation';

describe('validatePassword', () => {
  it('8자 미만 비밀번호에 대해 에러를 반환해야 한다', () => {
    expect(validatePassword('Ab1!xyz')).toBe('비밀번호는 8자 이상이어야 합니다.');
  });

  it('영문이 없을 때 에러를 반환해야 한다', () => {
    expect(validatePassword('12345678!')).toBe('영문을 포함해야 합니다.');
  });

  it('숫자가 없을 때 에러를 반환해야 한다', () => {
    expect(validatePassword('abcdefgh!')).toBe('숫자를 포함해야 합니다.');
  });

  it('특수문자가 없을 때 에러를 반환해야 한다', () => {
    expect(validatePassword('abcdefg1')).toBe('특수문자를 포함해야 합니다.');
  });

  it('유효한 비밀번호에 대해 null을 반환해야 한다', () => {
    expect(validatePassword('Password1!')).toBeNull();
  });

  it('다양한 특수문자를 허용해야 한다', () => {
    expect(validatePassword('Abcdefg1@')).toBeNull();
    expect(validatePassword('Abcdefg1#')).toBeNull();
    expect(validatePassword('Abcdefg1$')).toBeNull();
    expect(validatePassword('Abcdefg1%')).toBeNull();
    expect(validatePassword('Abcdefg1^')).toBeNull();
    expect(validatePassword('Abcdefg1&')).toBeNull();
  });

  it('빈 문자열에 대해 길이 검사 에러를 반환해야 한다', () => {
    expect(validatePassword('')).toBe('비밀번호는 8자 이상이어야 합니다.');
  });
});
