import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FilterBar from '@/components/content/FilterBar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const defaultProps = {
  selectedGenres: [],
  selectedProviders: [],
  selectedYear: undefined,
  selectedSort: undefined,
};

describe('FilterBar', () => {
  it('영화 탐색에서는 쿠팡플레이 OTT 필터를 표시하지 않아야 한다', () => {
    render(<FilterBar {...defaultProps} type="movie" />);

    expect(screen.queryByText('쿠팡플레이')).not.toBeInTheDocument();
  });

  it('시리즈 탐색에서는 쿠팡플레이 OTT 필터를 표시해야 한다', () => {
    render(<FilterBar {...defaultProps} type="tv" />);

    expect(screen.getByText('쿠팡플레이')).toBeInTheDocument();
  });
});
