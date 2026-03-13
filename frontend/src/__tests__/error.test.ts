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
  it('axios 에러 응답에서 문자열 메시지를 추출해야 한다', () => {
    const error = makeAxiosError(400, { message: '잘못된 요청입니다.' });
    expect(getErrorMessage(error)).toBe('잘못된 요청입니다.');
  });

  it('배열에서 첫 번째 메시지를 추출해야 한다', () => {
    const error = makeAxiosError(400, {
      message: ['이메일 형식이 잘못되었습니다.', '비밀번호가 필요합니다.'],
    });
    expect(getErrorMessage(error)).toBe('이메일 형식이 잘못되었습니다.');
  });

  it('401 상태에서 인증 에러를 반환해야 한다', () => {
    const error = makeAxiosError(401, {});
    expect(getErrorMessage(error)).toBe('인증에 실패했습니다.');
  });

  it('409 상태에서 충돌 에러를 반환해야 한다', () => {
    const error = makeAxiosError(409, {});
    expect(getErrorMessage(error)).toBe('이미 존재하는 계정입니다.');
  });

  it('기타 상태 코드에서 서버 에러를 반환해야 한다', () => {
    const error = makeAxiosError(500, {});
    expect(getErrorMessage(error)).toBe('서버 오류가 발생했습니다.');
  });

  it('표준 Error 객체를 처리해야 한다', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('알 수 없는 에러를 처리해야 한다', () => {
    expect(getErrorMessage('unknown')).toBe('알 수 없는 오류가 발생했습니다.');
  });
});
