import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PersonCredit,
  PersonCreditsResult,
  PersonDetail,
} from '@/types/content';

vi.mock('@/lib/fetcher', () => ({
  fetchApi: vi.fn(),
  isApiError: vi.fn(),
}));

import { fetchApi } from '@/lib/fetcher';
import PersonPage, {
  generateMetadata,
  generateStaticParams,
  revalidate,
} from '@/app/person/[personId]/page';

const mockFetchApi = vi.mocked(fetchApi);

const person: PersonDetail = {
  id: 1,
  name: '홍길동',
  profile_path: '/profile.jpg',
  biography: '한국의 배우입니다.',
};

function credit(id: number, overrides: Partial<PersonCredit> = {}): PersonCredit {
  return {
    id,
    media_type: 'movie',
    title: `작품 ${id}`,
    poster_path: `/poster-${id}.jpg`,
    release_date: `202${id}-01-01`,
    ...overrides,
  };
}

const indexableCredits: PersonCreditsResult = {
  cast: [credit(1), credit(2), credit(3)],
  crew: [],
};

function mockPersonMetadata(
  personResult: PersonDetail,
  creditsResult: PersonCreditsResult,
) {
  mockFetchApi
    .mockResolvedValueOnce(personResult)
    .mockResolvedValueOnce(creditsResult);
}

describe('Person generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('소개 또는 프로필이 있고 품질 작품이 3개 이상이면 index 가능해야 한다', async () => {
    mockPersonMetadata({ ...person, profile_path: ' ' }, indexableCredits);

    const metadata = await generateMetadata({
      params: Promise.resolve({ personId: '1' }),
    });

    expect(metadata.title).toBe('홍길동 필모그래피');
    expect(metadata.description).toBe('한국의 배우입니다.');
    expect(metadata.robots).toEqual({
      googleBot: { index: false, follow: false },
    });
  });

  it('소개가 공백이어도 프로필과 품질 작품이 있으면 index하고 description은 대체해야 한다', async () => {
    mockPersonMetadata(
      { ...person, biography: '   ' },
      indexableCredits,
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ personId: '1' }),
    });

    expect(metadata.description).toBe('홍길동의 출연작 목록');
    expect(metadata.openGraph?.description).toBe('홍길동의 출연작 목록');
    expect(metadata.twitter?.description).toBe('홍길동의 출연작 목록');
    expect(metadata.robots).toEqual({
      googleBot: { index: false, follow: false },
    });
  });

  it('소개와 프로필이 모두 비어 있으면 noindex, follow여야 한다', async () => {
    mockPersonMetadata(
      { ...person, biography: ' ', profile_path: ' ' },
      indexableCredits,
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ personId: '1' }),
    });

    expect(metadata.robots).toEqual({
      index: false,
      follow: true,
      googleBot: { index: false, follow: false },
    });
  });

  it('포스터와 공개일이 있는 고유 작품이 3개 미만이면 noindex, follow여야 한다', async () => {
    mockPersonMetadata(person, {
      cast: [
        credit(1),
        credit(1),
        credit(2, { poster_path: ' ' }),
        credit(3, { release_date: ' ', first_air_date: undefined }),
      ],
      crew: [credit(1), credit(4)],
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ personId: '1' }),
    });

    expect(metadata.robots).toEqual({
      index: false,
      follow: true,
      googleBot: { index: false, follow: false },
    });
  });

  it('인물 또는 필모그래피 조회가 실패하면 기본 metadata를 반환해야 한다', async () => {
    mockFetchApi.mockRejectedValue(new Error('API error'));

    const metadata = await generateMetadata({
      params: Promise.resolve({ personId: '0' }),
    });

    expect(metadata).toEqual({
      title: '인물 정보',
      robots: {
        googleBot: { index: false, follow: false },
      },
    });
  });
});

describe('Person ISR cache', () => {
  it('동적 인물 경로를 최초 요청 시 생성하고 6시간 주기로 재검증해야 한다', () => {
    expect(generateStaticParams()).toEqual([]);
    expect(revalidate).toBe(21600);
  });

  it('인물 조회의 일시적 실패를 전파해 정상 ISR 결과를 보호해야 한다', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('temporary person failure'));

    await expect(
      PersonPage({ params: Promise.resolve({ personId: '1' }) }),
    ).rejects.toThrow('temporary person failure');
  });
});
