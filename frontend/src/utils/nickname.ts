export const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_]+$/;
export const NICKNAME_MAX_BYTES = 16;
export const NICKNAME_RESERVED = ['admin', 'filmott', 'deleted'];

export function getNicknameByteLength(str: string): number {
  let len = 0;
  for (const ch of str) {
    len += /[\u3131-\uD79D]/.test(ch) ? 2 : 1;
  }
  return len;
}

export function validateNickname(value: string): string | null {
  if (value.length < 2) return '닉네임은 2자 이상이어야 합니다.';
  if (!NICKNAME_REGEX.test(value)) return '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  if (getNicknameByteLength(value) > NICKNAME_MAX_BYTES) return '닉네임이 너무 깁니다. (한글 8자 / 영문 16자 이내)';
  if (NICKNAME_RESERVED.some((w) => value.toLowerCase().startsWith(w))) return '사용할 수 없는 닉네임입니다.';
  if (/\s/.test(value)) return '공백은 사용할 수 없습니다.';
  return null;
}
