import type { SimilarContent } from './embedding.service';
import {
  extractRecommendationLineTitles,
  extractPreviouslyRecommendedTitles,
  formatRecommendationVisibleLine,
  matchStructuredRecommendationsToCandidates,
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

  it('형식이 느슨한 추천 본문에서도 독립 제목 줄을 추출해야 한다', () => {
    const result = extractRecommendationLineTitles(
      `멘탈/전략형 두뇌 서바이벌 예능 추천해요

피의 게임
말 한마디, 타이밍, 연합과 배신이 핵심입니다.

더 지니어스: 게임의 시작
룰을 해석하고 상대의 심리를 읽는 방식으로 전개돼요.

흑백요리사(요리 서바이벌)
경쟁 구조 자체가 계속 압박을 주는 편이에요.

원하시는 결이 심리전 쪽일까요?`,
    );

    expect(result).toEqual([
      '피의 게임',
      '더 지니어스: 게임의 시작',
      '흑백요리사',
    ]);
  });

  it('추천 제목의 괄호 수식어를 제거하고 굵은 제목-이유 형식으로 정규화해야 한다', () => {
    expect(
      formatRecommendationVisibleLine(
        '솔로지옥(같은 결의 예능) - 사람 심리와 선택의 흐름이 좋아요.',
      ),
    ).toBe('**솔로지옥** - 사람 심리와 선택의 흐름이 좋아요.');
    expect(formatRecommendationVisibleLine('대탈출(예능)')).toBe('**대탈출**');
  });

  it('추천 줄 앞에 잘못 붙은 굵은 표시와 불릿을 제거해야 한다', () => {
    expect(
      formatRecommendationVisibleLine(
        '**- 다멜리오 쇼 - 가족/일상 기반의 리얼리티라 몰입하기 좋아요.',
      ),
    ).toBe('**다멜리오 쇼** - 가족/일상 기반의 리얼리티라 몰입하기 좋아요.');
    expect(
      formatRecommendationVisibleLine(
        '- **카다시안 패밀리** - 유명인의 일상 속 감정선이 촘촘해요.',
      ),
    ).toBe('**카다시안 패밀리** - 유명인의 일상 속 감정선이 촘촘해요.');
  });

  it('깨진 굵은 표시 추천 줄에서도 제목을 추출해야 한다', () => {
    const result = extractRecommendationLineTitles(
      `**- 다멜리오 쇼 - 가족/일상 기반의 리얼리티라 몰입하기 좋아요.

**- 카다시안 패밀리 - 인물 심리 드라마 좋아하시면 만족도가 높을 것 같아요.`,
    );

    expect(result).toEqual(['다멜리오 쇼', '카다시안 패밀리']);
  });

  it('태그 없이 노출된 추천 trailer JSON 라인은 숨겨야 한다', () => {
    expect(
      formatRecommendationVisibleLine(
        '[{"tmdbId":225647,"contentType":"tv"},{"tmdbId":281016,"contentType":"tv"}]',
      ),
    ).toBeNull();
  });
});
