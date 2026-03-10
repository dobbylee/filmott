import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/utils/error';
import { AxiosError, AxiosHeaders } from 'axios';

function makeAxiosError(status: number, data?: unknown): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers } as AxiosError['config'];
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: 'Error',
    data,
    headers: {},
    config: config!,
  });
  return error;
}

describe('getErrorMessage', () => {
  it('should extract string message from axios error response', () => {
    const error = makeAxiosError(400, { message: '잘못된 요청입니다.' });
    expect(getErrorMessage(error)).toBe('잘못된 요청입니다.');
  });

  it('should extract first message from array', () => {
    const error = makeAxiosError(400, {
      message: ['이메일 형식이 잘못되었습니다.', '비밀번호가 필요합니다.'],
    });
    expect(getErrorMessage(error)).toBe('이메일 형식이 잘못되었습니다.');
  });

  it('should return auth error for 401', () => {
    const error = makeAxiosError(401, {});
    expect(getErrorMessage(error)).toBe('인증에 실패했습니다.');
  });

  it('should return conflict error for 409', () => {
    const error = makeAxiosError(409, {});
    expect(getErrorMessage(error)).toBe('이미 존재하는 계정입니다.');
  });

  it('should return server error for other status codes', () => {
    const error = makeAxiosError(500, {});
    expect(getErrorMessage(error)).toBe('서버 오류가 발생했습니다.');
  });

  it('should handle standard Error', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('should handle unknown error', () => {
    expect(getErrorMessage('unknown')).toBe('알 수 없는 오류가 발생했습니다.');
  });
});
