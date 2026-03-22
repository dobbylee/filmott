import { describe, it, expect } from 'vitest';
import { formatCommentDate } from '@/utils/date';

describe('formatCommentDate', () => {
  it('월, 일, 시간 정보를 포함하는 문자열을 반환한다', () => {
    const result = formatCommentDate('2024-12-25T12:30:00Z');
    expect(result).toContain('12');
    expect(result).toContain('25');
    expect(result).toContain(':');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });

  it('다른 날짜 입력에도 유효한 문자열을 반환한다', () => {
    const result = formatCommentDate('2024-01-01T00:00:00Z');
    expect(result).toContain('1');
    expect(result).toContain(':');
    expect(result.length).toBeGreaterThan(5);
  });

  it('오전/오후 또는 AM/PM 표시를 포함한다', () => {
    const morning = formatCommentDate('2024-06-15T01:00:00Z');
    const afternoon = formatCommentDate('2024-06-15T14:00:00Z');
    expect(morning).toMatch(/(오전|오후|AM|PM)/i);
    expect(afternoon).toMatch(/(오전|오후|AM|PM)/i);
  });
});
