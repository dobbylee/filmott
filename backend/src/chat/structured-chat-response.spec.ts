import type { SimilarContent } from './embedding.service';
import {
  extractPreviouslyRecommendedTitles,
  matchStructuredRecommendationsToCandidates,
  parseStructuredChatResponse,
  renderStructuredChatResponse,
} from './structured-chat-response';

describe('structured-chat-response', () => {
  const candidates: SimilarContent[] = [
    {
      contentId: 1,
      tmdbId: 496243,
      contentType: 'movie',
      title: '기생충',
      posterUrl: '/poster.jpg',
      genres: [{ id: 18, name: '드라마' }],
      voteAverage: 8.6,
      description: '어두운 스릴러',
      similarity: 0.95,
      director: '봉준호',
      originCountry: 'KR',
      overview: null,
    },
    {
      contentId: 2,
      tmdbId: 27205,
      contentType: 'movie',
      title: 'Inception',
      posterUrl: '/inception.jpg',
      genres: [{ id: 28, name: '액션' }],
      voteAverage: 8.8,
      description: '꿈의 세계',
      similarity: 0.92,
      director: '크리스토퍼 놀란',
      originCountry: 'US',
      overview: null,
    },
  ];

  it('구조화 응답을 검증하고 정리해야 한다', () => {
    const result = parseStructuredChatResponse({
      intro: ' 추천해 드릴게요. ',
      recommendations: [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: ' 기생충 ',
          englishTitle: ' Parasite ',
          reason: '사회 풍자가 강렬해요.',
        },
      ],
      outro: ' 더 원하면 말해주세요. ',
    });

    expect(result).toEqual({
      intro: '추천해 드릴게요.',
      recommendations: [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          englishTitle: 'Parasite',
          reason: '사회 풍자가 강렬해요.',
        },
      ],
      outro: '더 원하면 말해주세요.',
    });
  });

  it('추천 항목 형식이 깨지면 null을 반환해야 한다', () => {
    const result = parseStructuredChatResponse({
      intro: '추천해 드릴게요.',
      recommendations: [
        {
          tmdbId: '496243',
          contentType: 'movie',
          title: '기생충',
          englishTitle: 'Parasite',
          reason: '사회 풍자가 강렬해요.',
        },
      ],
      outro: '더 원하면 말해주세요.',
    });

    expect(result).toBeNull();
  });

  it('구조화 응답을 표시용 Markdown으로 렌더링해야 한다', () => {
    const text = renderStructuredChatResponse({
      intro: '오늘 볼 만한 작품이에요.',
      recommendations: [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          englishTitle: 'Parasite',
          reason: '긴장감과 풍자가 선명해요.',
        },
      ],
      outro: '다른 분위기도 말해주세요.',
    });

    expect(text).toContain('오늘 볼 만한 작품이에요.');
    expect(text).toContain('**기생충 (Parasite)** — 긴장감과 풍자가 선명해요.');
    expect(text).toContain('다른 분위기도 말해주세요.');
  });

  it('tmdbId와 contentType이 일치하는 후보만 카드 추천으로 매칭해야 한다', () => {
    const { matched, unmatched } = matchStructuredRecommendationsToCandidates(
      [
        {
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          englishTitle: 'Parasite',
          reason: '사회 풍자가 강렬해요.',
        },
        {
          tmdbId: 999999,
          contentType: 'movie',
          title: '후보 밖 작품',
          englishTitle: null,
          reason: '분위기가 잘 맞아요.',
        },
      ],
      candidates,
    );

    expect(matched).toEqual([
      {
        tmdbId: 496243,
        contentType: 'movie',
        title: '기생충',
        posterUrl: '/poster.jpg',
        reason: '사회 풍자가 강렬해요.',
      },
    ]);
    expect(unmatched).toEqual([{ korean: '후보 밖 작품', english: null }]);
  });

  it('제목이 후보와 같아도 tmdbId/contentType이 없으면 카드로 매칭하지 않아야 한다', () => {
    const { matched, unmatched } = matchStructuredRecommendationsToCandidates(
      [
        {
          tmdbId: null,
          contentType: null,
          title: '기생충',
          englishTitle: 'Parasite',
          reason: '사회 풍자가 강렬해요.',
        },
      ],
      candidates,
    );

    expect(matched).toEqual([]);
    expect(unmatched).toEqual([{ korean: '기생충', english: 'Parasite' }]);
  });

  it('굵은 글씨 키워드는 이전 추천작 fallback에서 제외해야 한다', () => {
    const result = extractPreviouslyRecommendedTitles([
      {
        role: 'assistant',
        content:
          '**청춘** 키워드로 골라봤어요.\n\n**기생충 (Parasite)** — 추천 이유입니다.',
      },
    ]);

    expect(result).toEqual(['기생충']);
  });

  it('history 추천 메타데이터가 있으면 fallback 파싱보다 우선해야 한다', () => {
    const result = extractPreviouslyRecommendedTitles([
      {
        role: 'assistant',
        content: '**청춘** 키워드로 골라봤어요.',
        recommendations: [
          {
            tmdbId: 496243,
            contentType: 'movie',
            title: '기생충',
          },
        ],
      },
    ]);

    expect(result).toEqual(['기생충']);
  });
});
