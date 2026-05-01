import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '@/lib/json-ld';

describe('serializeJsonLd', () => {
  it('script 종료 문자열을 이스케이프해야 한다', () => {
    const serialized = serializeJsonLd({
      name: '</script><script>alert("xss")</script>',
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized)).toEqual({
      name: '</script><script>alert("xss")</script>',
    });
  });

  it('HTML 특수 문자와 줄 구분 문자를 JSON 문법을 유지한 채 이스케이프해야 한다', () => {
    const value = {
      description: 'A&B > C < D\u2028next\u2029line',
    };
    const serialized = serializeJsonLd(value);

    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u003e');
    expect(serialized).toContain('\\u003c');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
