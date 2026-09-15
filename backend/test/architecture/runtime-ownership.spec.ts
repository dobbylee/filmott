import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import {
  assertProviderOwnership,
  assertEntityOwnership,
} from './runtime-ownership';

describe('runtime 소유권 판정', () => {
  const token = class Service {};
  const instance = new token();
  const expected = [{ token, instance }];
  it.each(['alias', 'useClass', 'useValue'] as const)(
    '실제 Nest의 %s 등록에서 공유 alias만 허용해야 한다',
    async (kind) => {
      const module = await Test.createTestingModule({
        providers: [
          token,
          kind === 'alias'
            ? { provide: 'COPY', useExisting: token }
            : kind === 'useClass'
              ? { provide: 'COPY', useClass: token }
              : { provide: 'COPY', useValue: new token() },
        ],
      }).compile();
      try {
        const registrations = [
          ...module.get(ModulesContainer).values(),
        ].flatMap((owner) => [...owner.providers.values()]);
        const check = () =>
          assertProviderOwnership(registrations, [
            { token, instance: module.get(token) },
          ]);
        if (kind === 'alias') {
          expect(module.get('COPY')).toBe(module.get(token));
          expect(check).not.toThrow();
        } else {
          expect(module.get('COPY')).not.toBe(module.get(token));
          expect(check).toThrow('단일 소유');
        }
      } finally {
        await module.close();
      }
    },
  );
  it('실제 owner와 별도 alias는 중복 등록으로 혼동하지 않아야 한다', () => {
    expect(() =>
      assertProviderOwnership(
        [
          { token, instance },
          { token: 'alias', instance, isAlias: true },
        ],
        expected,
      ),
    ).not.toThrow();
  });
  it.each(['missing', 'duplicate', 'wrong-instance'] as const)(
    '%s provider를 명시적으로 거부해야 한다',
    (type) => {
      const registrations =
        type === 'missing'
          ? []
          : type === 'duplicate'
            ? [
                { token, instance },
                { token, instance: new token() },
              ]
            : [{ token, instance: new token() }];
      expect(() => assertProviderOwnership(registrations, expected)).toThrow(
        '단일 소유',
      );
    },
  );
  it('같은 entity class는 한 번 존재해야 하고 table/class 복제를 거부해야 한다', () => {
    const other = class Other {};
    expect(() =>
      assertEntityOwnership(
        [{ tablePath: 'public.sample', target: token }],
        [token],
      ),
    ).not.toThrow();
    expect(() =>
      assertEntityOwnership(
        [
          { tablePath: 'public.sample', target: token },
          { tablePath: 'public.sample', target: other },
        ],
        [token, other],
      ),
    ).toThrow('table 중복');
    expect(() =>
      assertEntityOwnership(
        [
          { tablePath: 'public.sample', target: token },
          { tablePath: 'public.other', target: token },
        ],
        [token],
      ),
    ).toThrow('class 단일');
    expect(() => assertEntityOwnership([], [token])).toThrow('class 단일');
    expect(() =>
      assertEntityOwnership(
        [{ tablePath: 'public.sample', target: other }],
        [token],
      ),
    ).toThrow('예상하지 않은');
  });
  it('빈 검사 대상은 성공으로 처리하지 않아야 한다', () => {
    expect(() => assertProviderOwnership([], [])).toThrow();
    expect(() => assertEntityOwnership([], [])).toThrow();
  });
});
