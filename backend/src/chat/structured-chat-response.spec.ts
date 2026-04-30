import type { SimilarContent } from './embedding.service';
import {
  extractPreviouslyRecommendedTitles,
  matchStructuredRecommendationsToCandidates,
  parseVisibleChatContent,
  parseRecommendationTrailer,
  RECOMMENDATIONS_TRAILER_CLOSE,
  RECOMMENDATIONS_TRAILER_OPEN,
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

  it('추천 trailer를 파싱해야 한다', () => {
    const result = parseRecommendationTrailer(`좋은 영화를 추천해 드릴게요.

${RECOMMENDATIONS_TRAILER_OPEN}
[{"tmdbId":496243,"contentType":"movie"},{"tmdbId":1396,"contentType":"tv"}]
${RECOMMENDATIONS_TRAILER_CLOSE}`);

    expect(result).toEqual([
      { tmdbId: 496243, contentType: 'movie' },
      { tmdbId: 1396, contentType: 'tv' },
    ]);
  });

  it('추천 trailer 형식이 깨지면 빈 배열을 반환해야 한다', () => {
    const result = parseRecommendationTrailer(`${RECOMMENDATIONS_TRAILER_OPEN}
[{"tmdbId":"496243","contentType":"movie"}]
${RECOMMENDATIONS_TRAILER_CLOSE}`);

    expect(result).toEqual([]);
  });

  it('tmdbId와 contentType이 일치하는 후보만 카드 추천으로 매칭해야 한다', () => {
    const matched = matchStructuredRecommendationsToCandidates(
      [
        { tmdbId: 496243, contentType: 'movie' },
        { tmdbId: 999999, contentType: 'movie' },
      ],
      candidates,
    );

    expect(matched).toEqual([
      {
        tmdbId: 496243,
        contentType: 'movie',
        title: '기생충',
        posterUrl: '/poster.jpg',
      },
    ]);
  });

  it('tmdbId와 contentType이 일치하지 않으면 카드로 매칭하지 않아야 한다', () => {
    const matched = matchStructuredRecommendationsToCandidates(
      [{ tmdbId: 496243, contentType: 'tv' }],
      candidates,
    );

    expect(matched).toEqual([]);
  });

  it('표시 텍스트를 intro/items/outro로 분리해야 한다', () => {
    const result = parseVisibleChatContent(
      '오늘 볼 만한 작품이에요.\n**기생충** - 사회 풍자가 선명해요.\n**인셉션** - 꿈을 다루는 SF예요.\n더 가벼운 쪽으로도 골라드릴까요?',
    );

    expect(result).toEqual({
      intro: '오늘 볼 만한 작품이에요.',
      items: [
        { title: '기생충', description: '사회 풍자가 선명해요.' },
        { title: '인셉션', description: '꿈을 다루는 SF예요.' },
      ],
      outro: '더 가벼운 쪽으로도 골라드릴까요?',
    });
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
