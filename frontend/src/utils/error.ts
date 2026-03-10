import axios from 'axios';

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.message) {
      if (Array.isArray(data.message)) {
        return data.message[0];
      }
      return data.message;
    }
    if (error.response?.status === 401) {
      return '인증에 실패했습니다.';
    }
    if (error.response?.status === 409) {
      return '이미 존재하는 계정입니다.';
    }
    return '서버 오류가 발생했습니다.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}
