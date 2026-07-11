import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SimilarRecommendationCta, {
  buildSimilarRecommendationPrompt,
} from '@/components/content/SimilarRecommendationCta';

const mockTrackEvent = vi.fn();
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('SimilarRecommendationCta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('작품명을 포함한 채팅 입력 URL을 안전하게 만들어야 한다', () => {
    render(
      <SimilarRecommendationCta
        title="기생충 & 가족"
        tmdbId={496243}
        contentType="movie"
      />,
    );

    const link = screen.getByRole('link', {
      name: /이 작품을 바탕으로 취향 추천받기/,
    });
    expect(link).toHaveAttribute(
      'href',
      `/?chatPrompt=${encodeURIComponent('기생충 & 가족 같은 느낌을 좋아한다면 볼 만한 작품 추천해줘')}#chat-section`,
    );
    expect(link).toHaveClass('focus-visible:ring-2');
  });

  it('클릭하면 현재 상세의 AI 추천 행동을 기록해야 한다', () => {
    render(
      <SimilarRecommendationCta
        title="기생충"
        tmdbId={496243}
        contentType="movie"
      />,
    );

    const link = screen.getByRole('link');
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);

    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'ai_recommendation',
      content_type: 'movie',
      tmdb_id: 496243,
      authenticated: 0,
    });
  });

  it('질문 생성 시 작품명 양끝 공백을 제거해야 한다', () => {
    expect(buildSimilarRecommendationPrompt('  기생충  ')).toBe(
      '기생충 같은 느낌을 좋아한다면 볼 만한 작품 추천해줘',
    );
  });

  it('긴 작품명도 백엔드 메시지 제한인 500자를 넘지 않아야 한다', () => {
    const prompt = buildSimilarRecommendationPrompt('가'.repeat(500));

    expect(Array.from(prompt)).toHaveLength(500);
    expect(prompt).toMatch(/같은 느낌을 좋아한다면 볼 만한 작품 추천해줘$/);
  });

  it('로그인 사용자의 클릭은 authenticated를 1로 기록해야 한다', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 } });
    render(
      <SimilarRecommendationCta
        title="기생충"
        tmdbId={496243}
        contentType="movie"
      />,
    );
    const link = screen.getByRole('link');
    link.addEventListener('click', (event) => event.preventDefault());

    fireEvent.click(link);

    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'ai_recommendation',
      content_type: 'movie',
      tmdb_id: 496243,
      authenticated: 1,
    });
  });
});
