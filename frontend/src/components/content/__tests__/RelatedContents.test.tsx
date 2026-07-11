import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RelatedContents from '@/components/content/RelatedContents';
import type { RelatedContent } from '@/types/content';

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockTrackEvent = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, unoptimized, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        alt={typeof rest.alt === 'string' ? rest.alt : ''}
        data-fill={fill ? 'true' : undefined}
        data-unoptimized={unoptimized ? 'true' : undefined}
      />
    );
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

const items: RelatedContent[] = Array.from({ length: 7 }, (_, index) => ({
  tmdbId: index + 1,
  contentType: index % 2 === 0 ? 'movie' : 'tv',
  title: `비슷한 작품 ${index + 1}`,
  posterUrl: `https://image.tmdb.org/t/p/original/poster-${index + 1}.jpg`,
  releaseDate: `202${index}-01-01`,
  voteAverage: 8 + index / 10,
}));

describe('RelatedContents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('관련 작품을 최대 6개까지 상세 링크로 표시해야 한다', () => {
    render(
      <RelatedContents
        items={items}
        currentContentType="movie"
        currentTmdbId="550"
      />,
    );

    expect(
      screen.getByRole('heading', { name: '연관 작품' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('장르와 작품 정보를 바탕으로 골랐어요'),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: '연관 작품' });
    expect(section).toHaveAttribute(
      'aria-describedby',
      'related-contents-description',
    );
    expect(screen.getAllByRole('link')).toHaveLength(6);
    const firstLink = screen.getByText('비슷한 작품 1').closest('a');
    expect(firstLink).toHaveAttribute(
      'href',
      '/contents/movie/1',
    );
    expect(firstLink).toHaveClass('focus-visible:ring-2');
    expect(screen.getByText('비슷한 작품 6').closest('a')).toHaveAttribute(
      'href',
      '/contents/tv/6',
    );
    expect(screen.queryByText('비슷한 작품 7')).not.toBeInTheDocument();
  });

  it('비로그인 클릭은 현재 상세 작품을 기준으로 분석 이벤트를 보내야 한다', () => {
    render(
      <RelatedContents
        items={items.slice(0, 1)}
        currentContentType="movie"
        currentTmdbId="550"
      />,
    );

    fireEvent.click(screen.getByRole('link'));

    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'related_content',
      content_type: 'movie',
      tmdb_id: '550',
      authenticated: 0,
    });
  });

  it('로그인 클릭은 authenticated를 1로 보내야 한다', () => {
    mockUseAuth.mockReturnValue({ user: { id: 10 } });
    render(
      <RelatedContents
        items={items.slice(0, 1)}
        currentContentType="tv"
        currentTmdbId="1399"
      />,
    );

    fireEvent.click(screen.getByRole('link'));

    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'related_content',
      content_type: 'tv',
      tmdb_id: '1399',
      authenticated: 1,
    });
  });

  it('관련 작품이 없으면 섹션을 표시하지 않아야 한다', () => {
    const { container } = render(
      <RelatedContents
        items={[]}
        currentContentType="movie"
        currentTmdbId="550"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
