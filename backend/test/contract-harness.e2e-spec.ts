import axios from 'axios';
import assert from 'node:assert/strict';
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
  it.each([
    'http-sync',
    'http-async',
    'fetch-sync',
    'fetch-async',
    'node-assert',
    'missing-array',
    'missing-object',
    's3',
  ] as const)(
    '%s assertion을 업무에서 잡아도 close가 실패하고 전역 fixture를 복구해야 한다',
    async (boundary) => {
      const originalAdapter = axios.defaults.adapter;
      const originalFetch = globalThis.fetch;
      const originalSend = S3Client.prototype.send;
      const failure = () => {
        if (boundary === 'node-assert') assert.equal(1, 2);
        if (boundary === 'missing-array') expect(undefined).toHaveLength(1);
        if (boundary === 'missing-object')
          expect(undefined).toMatchObject({ ok: true });
        expect('실제값').toBe('틀린 기대값');
      };
      let s3Error: Error | undefined;
      if (boundary === 's3') {
        try {
          failure();
        } catch (error) {
          if (error instanceof Error) s3Error = error;
          else throw error;
        }
      }
      const harness = await createContractApp({
        http:
          boundary === 'http-async'
            ? async () => {
                await Promise.resolve();
                failure();
              }
            : () => {
                failure();
              },
        fetch:
          boundary === 'fetch-async'
            ? async () => {
                await Promise.resolve();
                failure();
                return new Response('{}');
              }
            : () => {
                failure();
                return Promise.resolve(new Response('{}'));
              },
        s3: [
          {
            command: 'DeleteObjectCommand',
            bucket: 'contract',
            key: 'test',
            error: s3Error,
          },
        ],
      });
      const client = new S3Client({ region: 'auto' });
      try {
        if (boundary.startsWith('fetch'))
          await fetch('https://fixture.local').catch(() => undefined);
        else if (boundary === 's3')
          await client
            .send(new DeleteObjectCommand({ Bucket: 'contract', Key: 'test' }))
            .catch(() => undefined);
        else await axios.get('https://fixture.local').catch(() => undefined);
      } finally {
        client.destroy();
        await expect(harness.close()).rejects.toMatchObject({
          message: '계약 fixture assertion 또는 앱 정리 실패',
          errors: [expect.objectContaining({ message: expect.any(String) })],
        });
      }
      expect(axios.defaults.adapter).toBe(originalAdapter);
      expect(globalThis.fetch).toBe(originalFetch);
      expect(S3Client.prototype.send).toBe(originalSend);
      const clean = await createContractApp();
      await expect(clean.close()).resolves.toBeUndefined();
    },
  );

  it.each(['http', 'fetch'] as const)(
    '%s의 의도한 외부 오류는 assertion 실패로 처리하지 않아야 한다',
    async (boundary) => {
      const error = new Error('의도한 외부 실패');
      const harness = await createContractApp({
        http: () => {
          throw error;
        },
        fetch: async () => {
          throw error;
        },
      });
      try {
        if (boundary === 'http')
          await expect(axios.get('https://fixture.local')).rejects.toBe(error);
        else await expect(fetch('https://fixture.local')).rejects.toBe(error);
      } finally {
        await expect(harness.close()).resolves.toBeUndefined();
      }
    },
  );
});
