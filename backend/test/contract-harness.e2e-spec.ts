import axios from 'axios';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
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
  it.each([
    'command',
    'bucket',
    'key',
    'unregistered',
    'unsupported',
    'extra',
  ] as const)(
    'S3 %s 위반은 외부 호출 전에 거부하고 업무에서 잡아도 누락을 기록해야 한다',
    async (violation) => {
      const harness = await createContractApp({
        s3:
          violation === 'unregistered'
            ? []
            : [
                {
                  command: 'DeleteObjectCommand',
                  bucket: 'contract',
                  key: 'profiles/allowed.webp',
                },
              ],
      });
      const client = new S3Client({ region: 'auto' });
      const input = {
        Bucket: violation === 'bucket' ? 'wrong' : 'contract',
        Key: violation === 'key' ? 'wrong.webp' : 'profiles/allowed.webp',
      };
      try {
        if (violation === 'extra')
          await client.send(new DeleteObjectCommand(input));
        const result =
          violation === 'command'
            ? client.send(new PutObjectCommand(input))
            : violation === 'unsupported'
              ? client.send(new ListBucketsCommand({}))
              : client.send(new DeleteObjectCommand(input));
        await expect(result).rejects.toThrow('미등록 S3 fixture');
        expect(harness.unexpected).toHaveLength(1);
        expect(harness.unexpected[0]).toContain('미등록 S3 fixture');
        expect(harness.s3Spy).toHaveBeenCalledTimes(
          violation === 'extra' ? 2 : 1,
        );
      } finally {
        client.destroy();
        await harness.close();
      }
    },
  );

  it.each([false, true])(
    '허용한 S3 호출만 지정된 결과를 반환해야 한다 (실패=%s)',
    async (fail) => {
      const error = new Error('고정 S3 실패');
      const harness = await createContractApp({
        s3: [
          {
            command: 'DeleteObjectCommand',
            bucket: 'contract',
            key: 'profiles/allowed.webp',
            ...(fail ? { error } : {}),
          },
        ],
      });
      const client = new S3Client({ region: 'auto' });
      try {
        const result = client.send(
          new DeleteObjectCommand({
            Bucket: 'contract',
            Key: 'profiles/allowed.webp',
          }),
        );
        if (fail) await expect(result).rejects.toBe(error);
        else await expect(result).resolves.toEqual({});
        expect(harness.unexpected).toEqual([]);
      } finally {
        client.destroy();
        await harness.close();
      }
    },
  );
});
