export function validatePassword(value: string): string | null {
  if (value.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[a-zA-Z]/.test(value)) return '영문을 포함해야 합니다.';
  if (!/\d/.test(value)) return '숫자를 포함해야 합니다.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) return '특수문자를 포함해야 합니다.';
  return null;
}
