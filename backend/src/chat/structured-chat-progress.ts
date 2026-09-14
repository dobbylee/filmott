type JsonPath = (string | number)[];

export interface StructuredChatProgress {
  isComplete(...path: JsonPath): boolean;
}

interface Container {
  kind: 'object' | 'array';
  path: JsonPath;
  key: string | null;
  index: number;
}

// SDK의 parsed snapshot 값은 그대로 사용하고, raw JSON에서는 값의 종료만 확인한다.
// 특히 숫자 ID의 일부와 완성된 ID, 생성 중인 문자열과 닫힌 문자열을 구분한다.
export function getStructuredChatProgress(
  json: string,
): StructuredChatProgress {
  const completed = new Set<string>();
  const stack: Container[] = [];
  const nextPath = (): JsonPath => {
    const parent = stack.at(-1);
    if (!parent) return [];
    return [
      ...parent.path,
      parent.kind === 'array' ? parent.index : (parent.key ?? ''),
    ];
  };
  const complete = (path: JsonPath): void => {
    completed.add(JSON.stringify(path));
    const parent = stack.at(-1);
    if (parent?.kind === 'array') parent.index += 1;
    else if (parent) parent.key = null;
  };

  for (let index = 0; index < json.length; ) {
    const character = json[index];
    if (/\s/.test(character) || character === ':' || character === ',') {
      index += 1;
    } else if (character === '{' || character === '[') {
      stack.push({
        kind: character === '{' ? 'object' : 'array',
        path: nextPath(),
        key: null,
        index: 0,
      });
      index += 1;
    } else if (character === '}' || character === ']') {
      const container = stack.pop();
      if (!container) break;
      complete(container.path);
      index += 1;
    } else if (character === '"') {
      const start = index++;
      let closed = false;
      while (index < json.length) {
        if (json[index] === '\\') index += 2;
        else if (json[index++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) break;
      const parent = stack.at(-1);
      if (parent?.kind === 'object' && parent.key === null) {
        const key: unknown = JSON.parse(json.slice(start, index));
        if (typeof key !== 'string') break;
        parent.key = key;
      } else {
        complete(nextPath());
      }
    } else {
      // SDK partial parser도 숫자 뒤 공백만으로는 값을 확정하지 않는다.
      // parsed snapshot에 숫자가 포함되는 실제 구분자까지 기다린다.
      while (index < json.length && !/[,}\]]/.test(json[index])) index += 1;
      if (index === json.length) break;
      complete(nextPath());
    }
  }

  return { isComplete: (...path) => completed.has(JSON.stringify(path)) };
}
