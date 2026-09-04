import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const harnessDocuments = [
  'AGENTS.md',
  'agent-harness/workflow.md',
  'agent-harness/testing.md',
  'agent-harness/promotion.md',
  'agent-harness/prompts/implementation-review.md',
];

export async function checkDocuments(root, files) {
  const errors = [];
  const packages = new Map();
  for (const name of files) {
    const path = resolve(root, name);
    let text;
    try { text = await readFile(path, 'utf8'); }
    catch { errors.push(`${name}: 문서를 읽을 수 없습니다.`); continue; }
    const lines = text.split('\n');
    if ((text.match(/^```/gm)?.length ?? 0) % 2 !== 0) errors.push(`${name}: 닫히지 않은 code fence`);
    for (const [index, line] of lines.entries()) {
      const at = `${name}:${index + 1}`;
      if (line !== line.trimEnd()) errors.push(`${at}: trailing whitespace`);
      for (const match of line.matchAll(/\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1].replace(/^<|>$/g, '');
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const file = decodeURIComponent(target.split('#')[0]).replace(/:\d+$/, '');
        try { await stat(resolve(dirname(path), file)); }
        catch { errors.push(`${at}: 존재하지 않는 링크 ${target}`); }
      }
      for (const match of line.matchAll(/\bnpm(?:\s+--prefix\s+([\w/-]+))?\s+(?:run\s+([\w:-]+)|(test))\b/g)) {
        const prefix = match[1] ?? '.';
        const script = match[2] ?? match[3];
        if (!['.', 'backend', 'frontend'].includes(prefix)) {
          errors.push(`${at}: 확인할 수 없는 npm prefix ${prefix}`);
          continue;
        }
        if (!packages.has(prefix)) {
          try { packages.set(prefix, JSON.parse(await readFile(resolve(root, prefix, 'package.json'), 'utf8'))); }
          catch { packages.set(prefix, {}); }
        }
        if (!Object.hasOwn(packages.get(prefix).scripts ?? {}, script)) {
          errors.push(`${at}: ${prefix}/package.json에 없는 script ${script}`);
        }
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const errors = await checkDocuments(root, [...new Set([...harnessDocuments, ...process.argv.slice(2)])]);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('하네스 문서 링크·검증 명령 검사 통과');
  }
}
