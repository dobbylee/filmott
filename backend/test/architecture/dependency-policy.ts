import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface DependencyEdge {
  from: string;
  to: string;
  specifier: string;
  line: number;
}
export interface DependencyReport {
  files: string[];
  edges: DependencyEdge[];
  issues: string[];
  violations: { rule: string; route: string[] }[];
}

const slash = (value: string) => value.replaceAll('\\', '/');
const inDirectory = (file: string, directory: string) =>
  file === directory || file.startsWith(`${directory}/`);
const isTest = (file: string) =>
  inDirectory(file, 'test') ||
  /(?:^|\/)__tests__\//.test(file) ||
  /(?:\.spec|\.test|-spec)\.[cm]?[jt]sx?$/.test(file);
const isSource = (file: string) => inDirectory(file, 'src') && !isTest(file);

function forbidden(origin: string, target: string): string | undefined {
  if (isTest(target)) return 'production → test';
  if (
    inDirectory(origin, 'src/recommendation') &&
    inDirectory(target, 'src/chat')
  )
    return 'recommendation → chat';
  if (
    inDirectory(origin, 'src/contents') &&
    inDirectory(target, 'src/recommendation')
  )
    return 'contents → recommendation';
  if (
    inDirectory(origin, 'src/integrations') &&
    isSource(target) &&
    !inDirectory(target, 'src/integrations') &&
    !inDirectory(target, 'src/common')
  )
    return 'integrations → business';
  return undefined;
}

function isRequire(expression: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expression) && expression.text === 'require') ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'module' &&
      expression.name.text === 'require')
  );
}

export function inspectDependencies(backendRoot: string): DependencyReport {
  const root = realpathSync(backendRoot);
  const report: DependencyReport = {
    files: [],
    edges: [],
    issues: [],
    violations: [],
  };
  const configPath = path.join(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    report.issues.push(
      `tsconfig: ${ts.flattenDiagnosticMessageText(config.error.messageText, ' ')}`,
    );
    return report;
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    report.issues.push(
      ...parsed.errors.map(
        (error) =>
          `tsconfig: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`,
      ),
    );
    return report;
  }
  const relative = (file: string) => slash(path.relative(root, file));
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        report.issues.push(`source symlink 분석 필요: ${relative(file)}`);
      } else if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '__tests__'].includes(entry.name))
          scan(file);
      } else if (
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        isSource(relative(file))
      ) {
        report.files.push(relative(file));
      }
    }
  }
  try {
    scan(path.join(root, 'src'));
  } catch (error) {
    report.issues.push(
      `source scan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  report.files.sort();
  if (!report.files.length)
    report.issues.push('production source 목록이 비어 있습니다.');
  const cache = ts.createModuleResolutionCache(
    root,
    (file) => file,
    parsed.options,
  );
  const localAlias = (specifier: string) =>
    Object.keys(parsed.options.paths ?? {}).some((alias) => {
      const [prefix, suffix] = alias.split('*');
      return suffix === undefined
        ? alias === specifier
        : specifier.startsWith(prefix) && specifier.endsWith(suffix);
    });
  const scanned = new Set(report.files);
  const program = ts.createProgram(
    report.files.map((file) => path.join(root, file)),
    { ...parsed.options, allowJs: true, noEmit: true },
  );
  for (const from of report.files) {
    const file = path.join(root, from);
    const parsedSource = program.getSourceFile(file);
    if (!parsedSource) {
      report.issues.push(`source 해석 실패: ${from}`);
      continue;
    }
    const source: ts.SourceFile = parsedSource;
    const syntax = program.getSyntacticDiagnostics(source);
    report.issues.push(
      ...syntax
        .filter((d) => d.category === ts.DiagnosticCategory.Error)
        .map(
          (d) =>
            `${from}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
        ),
    );
    function dependency(node: ts.Node, argument: ts.Node | undefined) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (!argument || !ts.isStringLiteralLike(argument)) {
        report.issues.push(
          `${from}:${line}: 비리터럴 module loading 분석 필요`,
        );
        return;
      }
      const specifier = argument.text;
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        parsed.options,
        ts.sys,
        cache,
      ).resolvedModule;
      if (!resolved) {
        if (
          specifier.startsWith('.') ||
          path.isAbsolute(specifier) ||
          specifier.startsWith('#') ||
          /^(src|test)\//.test(specifier) ||
          localAlias(specifier)
        ) {
          report.issues.push(
            `${from}:${line}: 로컬 의존을 해석하지 못했습니다: ${specifier}`,
          );
        }
        return;
      }
      const to = relative(resolved.resolvedFileName);
      if (inDirectory(to, 'src') || inDirectory(to, 'test')) {
        report.edges.push({ from, to, specifier, line });
        if (
          isSource(to) &&
          !scanned.has(to) &&
          resolved.extension !== '.json'
        ) {
          report.issues.push(`${from}:${line}: scan 밖 source 의존: ${to}`);
        }
      } else if (!resolved.isExternalLibraryImport) {
        report.issues.push(
          `${from}:${line}: production 경계 밖 로컬 의존 분석 필요: ${to}`,
        );
      }
    }
    function visit(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        dependency(node, node.moduleSpecifier);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dependency(node, node.moduleReference.expression);
      } else if (ts.isImportTypeNode(node)) {
        dependency(
          node,
          ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined,
        );
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          isRequire(node.expression))
      ) {
        dependency(node, node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of report.edges)
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  for (const origin of report.files) {
    const seen = new Set([origin]);
    const queue = [[origin]];
    for (let index = 0; index < queue.length; index++) {
      const route = queue[index];
      for (const target of adjacency.get(route[route.length - 1]) ?? []) {
        if (seen.has(target)) continue;
        seen.add(target);
        const next = [...route, target];
        const rule = forbidden(origin, target);
        if (rule) report.violations.push({ rule, route: next });
        queue.push(next);
      }
    }
  }
  return report;
}

export function assertDependencyPolicy(report: DependencyReport): void {
  const messages = [
    ...report.issues,
    ...report.violations.map((v) => `${v.rule}: ${v.route.join(' → ')}`),
  ];
  if (!report.files.length && !messages.length)
    messages.push('production source 목록이 비어 있습니다.');
  if (messages.length) throw new Error(messages.join('\n'));
}
