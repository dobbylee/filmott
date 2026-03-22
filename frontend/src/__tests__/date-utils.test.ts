import { describe, it, expect } from 'vitest';
import { formatCommentDate } from '@/utils/date';

const DATE_FORMAT_PATTERN = /^\d{1,2}월 \d{1,2}일 (오전|오후) \d{2}:\d{2}$/;

describe('formatCommentDate', () => {
  it('한국어 날짜 포맷(M월 D일 오전/오후 HH:MM)을 반환한다', () => {
    const result = formatCommentDate('2024-12-25T12:30:00Z');
    expect(result).toMatch(DATE_FORMAT_PATTERN);
    expect(result).toContain('12월');
    expect(result).toContain('25일');
  });

  it('1월 1일 자정 입력을 올바른 한국어 포맷으로 변환한다', () => {
    const result = formatCommentDate('2024-01-01T00:00:00Z');
    expect(result).toMatch(DATE_FORMAT_PATTERN);
    expect(result).toContain('1월');
    expect(result).toContain('1일');
  });

  it('시간 부분에 오전/오후 표시를 포함한다', () => {
    const morning = formatCommentDate('2024-06-15T01:00:00Z');
    const afternoon = formatCommentDate('2024-06-15T08:00:00Z');
    expect(morning).toMatch(/(오전|오후)/);
    expect(afternoon).toMatch(/(오전|오후)/);
  });
});
