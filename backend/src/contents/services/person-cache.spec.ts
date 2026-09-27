import { PersonCache } from './person-cache';

const entry = (value: string) => ({ data: [value], expiresAt: 100 });

describe('인물 캐시 보유 한도', () => {
  it('항목 상한에 도달하면 최근 조회한 항목을 남기고 가장 오래 사용하지 않은 항목을 제거한다', () => {
    const cache = new PersonCache<string[]>(2, 100);
    cache.set(1, entry('a'));
    cache.set(2, entry('b'));
    expect(cache.get(1)?.data).toEqual(['a']);
    cache.set(3, entry('c'));

    expect(cache.size).toBe(2);
    expect(cache.get(1)?.data).toEqual(['a']);
    expect(cache.get(2)).toBeUndefined();
    expect(cache.get(3)?.data).toEqual(['c']);
  });

  it('한글을 포함한 JSON byte 예산의 경계까지 보유하고 초과하면 퇴출한다', () => {
    // ["한"]은 UTF-8 7 bytes, ["a"]는 5 bytes다.
    const cache = new PersonCache<string[]>(10, 12);
    cache.set(1, entry('한'));
    cache.set(2, entry('a'));
    expect(cache.size).toBe(2);
    cache.set(3, entry('글'));

    expect(cache.size).toBe(2);
    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)?.data).toEqual(['a']);
    expect(cache.get(3)?.data).toEqual(['글']);
  });

  it('같은 key 갱신은 이전 byte를 회수하고 새 크기로 계산한다', () => {
    const cache = new PersonCache<string[]>(10, 12);
    cache.set(1, entry('a'));
    cache.set(2, entry('b'));
    cache.set(1, entry('c'));
    expect(cache.size).toBe(2);
    cache.set(1, entry('abcd'));

    expect(cache.size).toBe(1);
    expect(cache.get(1)?.data).toEqual(['abcd']);
    expect(cache.get(2)).toBeUndefined();
  });

  it('예산보다 큰 항목은 보유하지 않고 다른 항목은 유지한다', () => {
    const cache = new PersonCache<string[]>(10, 12);
    cache.set(1, entry('a'));
    cache.set(2, entry('b'));
    cache.set(1, entry('x'.repeat(20)));
    cache.set(3, entry('x'.repeat(20)));

    expect(cache.size).toBe(1);
    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)?.data).toEqual(['b']);
    expect(cache.get(3)).toBeUndefined();
  });

  it('순회 중 만료 삭제는 예산을 회수하며 중복 삭제는 예산을 바꾸지 않는다', () => {
    const cache = new PersonCache<string[]>(10, 10);
    cache.set(1, entry('a'));
    cache.set(2, { data: ['b'], expiresAt: 200 });
    for (const [key, value] of cache) {
      if (value.expiresAt <= 100) cache.delete(key);
    }
    expect(cache.delete(1)).toBe(false);
    cache.set(3, entry('c'));
    expect(cache.size).toBe(2);
    cache.set(4, entry('d'));
    expect(cache.get(2)).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('만료 여부는 서비스가 판단하도록 만료 항목도 조회할 수 있다', () => {
    const cache = new PersonCache<string[]>(10, 100);
    cache.set(1, { data: ['stale'], expiresAt: 0 });
    expect(cache.get(1)).toMatchObject({ data: ['stale'], expiresAt: 0 });
  });
});
