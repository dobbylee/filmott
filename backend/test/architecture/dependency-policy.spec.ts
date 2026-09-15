import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  inspectDependencies,
  assertDependencyPolicy,
} from './dependency-policy';

const temporary: string[] = [];
function fixture(
  files: Record<string, string>,
  options: Record<string, unknown> = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'filmott-dependency-policy-'));
  temporary.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'commonjs',
        moduleResolution: 'node',
        skipLibCheck: true,
        ...options,
      },
    }),
  );
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return root;
}
afterEach(() => {
  for (const root of temporary.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('의존 방향 정책', () => {
  it('실제 production source의 네 경계는 금지 의존 없이 유지해야 한다', () => {
    const report = inspectDependencies(path.resolve(__dirname, '../..'));
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.edges.length).toBeGreaterThan(0);
    expect(report.files.some((file) => file.includes('recommendation/'))).toBe(
      true,
    );
    expect(report.files.some((file) => file.includes('contents/'))).toBe(true);
    expect(report.files.some((file) => file.includes('integrations/'))).toBe(
      true,
    );
    expect(() => assertDependencyPolicy(report)).not.toThrow();
  });

  it.each([
    [
      'src/recommendation/entry.ts',
      'src/chat/target.ts',
      '../chat/target',
      'recommendation → chat',
    ],
    [
      'src/contents/entry.ts',
      'src/recommendation/target.ts',
      '../recommendation/target',
      'contents → recommendation',
    ],
    [
      'src/integrations/entry.ts',
      'src/users/target.ts',
      '../users/target',
      'integrations → business',
    ],
    [
      'src/common/entry.ts',
      'test/target.ts',
      '../../test/target',
      'production → test',
    ],
    [
      'src/common/entry.ts',
      'src/common/target.spec.ts',
      './target.spec',
      'production → test',
    ],
  ])(
    '%s에서 %s로 향하는 직접 의존을 거부해야 한다',
    (from, to, specifier, rule) => {
      const report = inspectDependencies(
        fixture({
          [from]: `import { value } from '${specifier}';`,
          [to]: 'export const value = 1;',
        }),
      );
      expect(report.issues).toEqual([]);
      expect(report.violations).toContainEqual({ rule, route: [from, to] });
      expect(() => assertDependencyPolicy(report)).toThrow(rule);
    },
  );

  it.each([
    "import type { Value } from '../chat/target';",
    "export { value } from '../chat/target';",
    "export * from '../chat/target';",
    "export type { Value } from '../chat/target';",
    "type Value = import('../chat/target').Value;",
    "const load = () => import('../chat/target');",
    'const load = () => import(`../chat/target`);',
    "const value = require('../chat/target');",
    "const value = module.require('../chat/target');",
    "import value = require('../chat/target');",
  ])('의존 표현 %s를 빠뜨리지 않아야 한다', (expression) => {
    const report = inspectDependencies(
      fixture({
        'src/recommendation/entry.ts': expression,
        'src/chat/target.ts': 'export const value=1; export interface Value {}',
      }),
    );
    expect(report.issues).toEqual([]);
    expect(
      report.violations.some((v) => v.rule === 'recommendation → chat'),
    ).toBe(true);
  });

  it('barrel과 common을 거친 의존 경로도 끝까지 표시해야 한다', () => {
    const report = inspectDependencies(
      fixture({
        'src/recommendation/entry.ts':
          "import { value } from '../common/bridge';",
        'src/common/bridge.ts': "export { value } from './barrel';",
        'src/common/barrel.ts': "export { value } from '../chat/target';",
        'src/chat/target.ts': 'export const value=1;',
      }),
    );
    expect(report.violations).toContainEqual({
      rule: 'recommendation → chat',
      route: [
        'src/recommendation/entry.ts',
        'src/common/bridge.ts',
        'src/common/barrel.ts',
        'src/chat/target.ts',
      ],
    });
  });

  it('tsconfig alias와 js 확장자 참조를 실제 TS 경로로 해석해야 한다', () => {
    const report = inspectDependencies(
      fixture(
        {
          'src/recommendation/entry.ts':
            "import { value } from '@chat/target.js';",
          'src/chat/target.ts': 'export const value=1;',
        },
        { baseUrl: '.', paths: { '@chat/*': ['src/chat/*'] } },
      ),
    );
    expect(report.issues).toEqual([]);
    expect(report.violations).toContainEqual({
      rule: 'recommendation → chat',
      route: ['src/recommendation/entry.ts', 'src/chat/target.ts'],
    });
  });

  it('정상 업무 entity 순환·common·외부 package와 테스트의 production 사용은 허용해야 한다', () => {
    const report = inspectDependencies(
      fixture({
        'src/recommendation/entry.ts':
          "import { value } from '../contents/catalog';",
        'src/contents/catalog.ts': "export { value } from './content.entity';",
        'src/contents/content.entity.ts':
          "import type { User } from '../users/user.entity'; export const value=1;",
        'src/users/user.entity.ts':
          "import { value } from '../contents/content.entity'; export interface User {}",
        'src/integrations/client.ts':
          "import { date } from '../common/date'; import path from 'node:path';",
        'src/common/date.ts':
          "import type { DateValue } from './types'; export const date=1;",
        'src/common/types.d.ts': 'export interface DateValue { value: number }',
        'src/chat/consumer.ts':
          "import { value } from '../recommendation/entry';",
        'src/chat/consumer.spec.ts':
          "import { value } from '../recommendation/entry';",
        'test/chat-evals/fixture.ts':
          "import { value } from '../../src/recommendation/entry';",
        'docs/baselines/entry.ts': "import '../chat/invalid';",
      }),
    );
    expect(report.files).not.toContain('src/chat/consumer.spec.ts');
    expect(report.files).not.toContain('test/chat-evals/fixture.ts');
    expect(() => assertDependencyPolicy(report)).not.toThrow();
  });

  it.each([
    'const value=require(name);',
    'const value=import(name);',
    "import { value } from './missing';",
  ])('해석하지 못한 의존 %s를 통과시키지 않아야 한다', (expression) => {
    const report = inspectDependencies(
      fixture({ 'src/common/entry.ts': expression }),
    );
    expect(report.issues.length).toBeGreaterThan(0);
    expect(() => assertDependencyPolicy(report)).toThrow();
  });

  it('미해결 alias·source 밖 로컬 참조·생략된 source를 통과시키지 않아야 한다', () => {
    const report = inspectDependencies(
      fixture(
        {
          'src/common/entry.ts':
            "import '@chat/missing'; import '../../support/bridge'; import '../dist/skipped';",
          'support/bridge.ts': "import '../src/chat/target';",
          'src/dist/skipped.ts': "import '../chat/target';",
          'src/chat/target.ts': 'export {};',
        },
        { baseUrl: '.', paths: { '@chat/*': ['src/chat/*'] } },
      ),
    );
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('@chat/missing'),
        expect.stringContaining('support/bridge'),
        expect.stringContaining('scan 밖'),
      ]),
    );
  });

  it('빈 source와 문법 오류를 성공으로 처리하지 않아야 한다', () => {
    expect(() =>
      assertDependencyPolicy(inspectDependencies(fixture({}))),
    ).toThrow();
    const report = inspectDependencies(
      fixture({ 'src/common/entry.ts': 'export const value = ;' }),
    );
    expect(report.issues.length).toBeGreaterThan(0);
    expect(() => assertDependencyPolicy(report)).toThrow();
  });

  it('source symlink로 검사 범위를 누락시키지 않아야 한다', () => {
    const root = fixture({
      'src/common/entry.ts': 'export {};',
      'support/hidden.ts': 'export {};',
    });
    symlinkSync(
      path.join(root, 'support'),
      path.join(root, 'src/hidden'),
      'dir',
    );
    expect(() => assertDependencyPolicy(inspectDependencies(root))).toThrow(
      'symlink',
    );
  });
});
