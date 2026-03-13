import { describe, it, expect } from 'vitest';
import { formatCommentDate } from '@/utils/date';

describe('formatCommentDate', () => {
  it('한국어 형식으로 날짜를 포맷한다', () => {
    const result = formatCommentDate('2024-12-25T12:30:00Z');
    // 결과에 월, 일이 포함되어야 함
    expect(result).toContain('12');
    expect(result).toBeTruthy();
  });

  it('빈 문자열이 아닌 결과를 반환한다', () => {
    const result = formatCommentDate('2024-01-01T00:00:00Z');
    expect(result.length).toBeGreaterThan(0);
  });
});
