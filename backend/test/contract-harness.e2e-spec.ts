import axios from 'axios';
import { createContractApp } from './contracts/contract-app';

describe('계약 검사 외부 통신 격리', () => {
  it('미등록 Axios·fetch 요청은 통신 전에 실패하고 누락 증거를 남겨야 한다', async () => {
    const originalAdapter = axios.defaults.adapter;
    const originalFetch = globalThis.fetch;
    const harness = await createContractApp();
    try {
      await expect(
        axios.get('https://not-registered.contract.local/test'),
      ).rejects.toThrow('등록되지 않은 외부 HTTP 요청');
      await expect(
        fetch('https://not-registered.contract.local/test'),
      ).rejects.toThrow('등록되지 않은 외부 fetch 요청');
      expect(harness.unexpected).toEqual([
        'get https://not-registered.contract.local/test',
        'https://not-registered.contract.local/test',
      ]);
    } finally {
      await harness.close();
    }
    expect(axios.defaults.adapter).toBe(originalAdapter);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('fixture가 등록되지 않은 경로를 거부하면 업무에서 잡아도 누락을 기록해야 한다', async () => {
    const harness = await createContractApp({
      http: () => {
        throw new Error('미등록 fixture: /unknown');
      },
    });
    try {
      await axios.get('/unknown').catch(() => undefined);
      expect(harness.unexpected).toEqual(['미등록 fixture: /unknown']);
    } finally {
      await harness.close();
    }
  });
});
