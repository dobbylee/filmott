import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import expectedRoutes from './contracts/api-routes.json';
import { createContractApp } from './contracts/contract-app';

describe('실제 module의 API·cron 등록 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  beforeAll(async () => {
    harness = await createContractApp();
  });
  afterAll(async () => {
    await harness?.close();
  });

  it('60개 공개 route의 경로·method·guard·role을 중복 없이 유지해야 한다', () => {
    const discovery = harness.app.get(DiscoveryService);
    const scanner = new MetadataScanner();
    const routes: typeof expectedRoutes = [];
    const guards = (target: object): string[] => {
      const metadata: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
      if (metadata === undefined) return [];
      if (
        !Array.isArray(metadata) ||
        !metadata.every((value) => typeof value === 'function')
      )
        throw new Error('알 수 없는 guard metadata');
      return metadata.map((guard: { name: string }) => guard.name);
    };
    for (const wrapper of discovery.getControllers()) {
      const type = wrapper.metatype;
      const instance: unknown = wrapper.instance;
      if (!type || typeof instance !== 'object' || instance === null) continue;
      const prefix: unknown = Reflect.getMetadata(PATH_METADATA, type);
      if (typeof prefix !== 'string')
        throw new Error('문서화되지 않은 controller path');
      for (const methodName of scanner.getAllMethodNames(
        Object.getPrototypeOf(instance),
      )) {
        const handler: unknown = Reflect.get(instance, methodName);
        if (typeof handler !== 'function') continue;
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const routePath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        const roles: unknown =
          Reflect.getMetadata('roles', handler) ??
          Reflect.getMetadata('roles', type) ??
          [];
        if (
          typeof method !== 'number' ||
          typeof routePath !== 'string' ||
          !Array.isArray(roles) ||
          !roles.every((role) => typeof role === 'string')
        )
          throw new Error('문서화되지 않은 route metadata');
        routes.push({
          method: RequestMethod[method],
          path: ['/api', prefix, routePath]
            .join('/')
            .replace(/\/+/g, '/')
            .replace(/\/$/, ''),
          guards: [...guards(type), ...guards(handler)],
          roles,
        });
      }
    }
    routes.sort((a, b) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`, 'en'),
    );
    const sortedExpected = [...expectedRoutes].sort((a, b) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`, 'en'),
    );
    expect(routes).toEqual(sortedExpected);
    expect(
      new Set(routes.map((route) => `${route.method} ${route.path}`)).size,
    ).toBe(60);
  });

  it('cron의 이름·KST 예약 표현식과 단일 provider 등록을 유지해야 한다', () => {
    const discovery = harness.app.get(DiscoveryService);
    const scanner = new MetadataScanner();
    const cron: { name: string; cronTime: string; timeZone: string }[] = [];
    for (const wrapper of discovery.getProviders()) {
      if (wrapper.isAlias) continue;
      const instance: unknown = wrapper.instance;
      if (typeof instance !== 'object' || instance === null) continue;
      for (const method of scanner.getAllMethodNames(
        Object.getPrototypeOf(instance),
      )) {
        const handler: unknown = Reflect.get(instance, method);
        if (typeof handler !== 'function') continue;
        const options: unknown = Reflect.getMetadata(
          'SCHEDULE_CRON_OPTIONS',
          handler,
        );
        if (options === undefined) continue;
        if (
          typeof options !== 'object' ||
          options === null ||
          !('name' in options) ||
          !('cronTime' in options) ||
          !('timeZone' in options) ||
          typeof options.name !== 'string' ||
          typeof options.cronTime !== 'string' ||
          typeof options.timeZone !== 'string'
        ) {
          throw new Error('문서화되지 않은 cron metadata');
        }
        cron.push({
          name: options.name,
          cronTime: options.cronTime,
          timeZone: options.timeZone,
        });
      }
    }
    const expected = [
      ['clean-expired-tokens', '0 3 * * *'],
      ['person-cache-cleanup', '0 */6 * * *'],
      ['daily-box-office-midnight', '5 0 * * *'],
      ['daily-box-office-retry', '25 0 * * *'],
      ['daily-box-office-stabilization', '0 1 * * *'],
      ['daily-box-office-noon', '0 12 * * *'],
      ['weekly-box-office', '30 0 * * 1'],
      ['weekly-box-office-retry', '30 1 * * 1'],
      ['daily-trending', '0 6 * * *'],
      ['korean-tv-discover', '0 7 * * *'],
    ].map(([name, cronTime]) => ({ name, cronTime, timeZone: 'Asia/Seoul' }));
    expect(cron.sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      expected.sort((a, b) => a.name.localeCompare(b.name)),
    );
    // 실행 예약은 테스트 설정에서 꺼져 있다. 위 검사는 실제 provider metadata를 대조한다.
    expect(harness.app.get(SchedulerRegistry).getCronJobs().size).toBe(0);
  });
});
