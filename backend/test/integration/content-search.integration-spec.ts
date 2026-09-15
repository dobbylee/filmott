import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RecommendationSearchService } from '../../src/recommendation/recommendation-search.service';
import { ContentMetadataService } from '../../src/recommendation/content-metadata.service';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import {
  createIntegrationFixtures,
  createVectorLiteral,
  createDirectionalEmbedding,
} from './helpers/fixtures';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

const embedding = Array.from({ length: 1536 }, () => 0.01);
const netflixProviders = {
  flatrate: [
    {
      provider_id: 8,
      provider_name: 'Netflix',
      logo_path: '/netflix.png',
    },
  ],
};

describeWithDb('content search integration', () => {
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let service: RecommendationSearchService;
  const metadataService = {
    isEmbeddingAvailable: () => true,
    generateEmbedding: jest.fn<Promise<number[]>, [string]>(),
  };

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
    moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationSearchService,
        { provide: DataSource, useValue: dataSource },
        { provide: ContentMetadataService, useValue: metadataService },
      ],
    }).compile();
    service = moduleRef.get(RecommendationSearchService);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
    metadataService.generateEmbedding.mockResolvedValue(embedding);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('필터와 제외 조건을 실제 SQL 결과에 반영해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const includedContentIds: number[] = [];

    for (let index = 0; index < 5; index++) {
      const content = await fixtures.content({
        title: `포함 콘텐츠 ${index + 1}`,
        tmdbId: 410000 + index,
        contentType: 'movie',
        posterUrl: `/included-${index + 1}.jpg`,
        originCountry: 'KR',
        genres: [{ id: 18, name: '드라마' }],
        director: '포함 감독',
        watchProviders: netflixProviders,
        credits: [
          {
            id: 100 + index,
            name: '포함 배우',
            character: '주연',
            order: 0,
          },
        ],
        voteCount: 1000 + index,
      });
      await fixtures.contentMetadata({
        contentId: content.id,
        description: `포함 설명 ${index + 1}`,
        embedding: createVectorLiteral(1536, 0.01),
      });
      includedContentIds.push(content.id);
    }

    const excludedByAdult = await fixtures.content({
      title: '성인 콘텐츠',
      tmdbId: 420001,
      posterUrl: '/excluded-adult.jpg',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
      adult: true,
    });
    const excludedByType = await fixtures.content({
      title: 'TV 콘텐츠',
      tmdbId: 420002,
      contentType: 'tv',
      posterUrl: '/excluded-tv.jpg',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
    });
    const excludedByCountry = await fixtures.content({
      title: '미국 콘텐츠',
      tmdbId: 420003,
      posterUrl: '/excluded-country.jpg',
      originCountry: 'US',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
    });
    const excludedByGenre = await fixtures.content({
      title: '공포 콘텐츠',
      tmdbId: 420004,
      posterUrl: '/excluded-genre.jpg',
      originCountry: 'KR',
      genres: [{ id: 27, name: '공포' }],
      watchProviders: netflixProviders,
    });
    const excludedByDirector = await fixtures.content({
      title: '제외 감독 콘텐츠',
      tmdbId: 420005,
      posterUrl: '/excluded-director.jpg',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      director: '제외 감독',
      watchProviders: netflixProviders,
    });
    const excludedByTmdbId = await fixtures.content({
      title: 'TMDB 제외 콘텐츠',
      tmdbId: 420006,
      posterUrl: '/excluded-tmdb.jpg',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
    });

    for (const content of [
      excludedByAdult,
      excludedByType,
      excludedByCountry,
      excludedByGenre,
      excludedByDirector,
      excludedByTmdbId,
    ]) {
      await fixtures.contentMetadata({
        contentId: content.id,
        description: `${content.title} 설명`,
        embedding: createVectorLiteral(1536, 0.01),
      });
    }

    const result = await service.searchWithFilters(
      '넷플릭스 한국 드라마 추천',
      20,
      [excludedByTmdbId.tmdbId],
      {
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        excludeCountries: ['US'],
        contentType: 'movie',
        genres: ['드라마'],
        excludeGenres: ['공포'],
        excludePersonNames: ['제외 감독'],
      },
      embedding,
    );

    expect(result).toHaveLength(5);
    expect(result.map((item) => item.contentId).sort()).toEqual(
      [...includedContentIds].sort(),
    );
  });

  it('metadata 결과를 KOBIS fallback보다 우선해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const metadataContent = await fixtures.content({
      title: '메타데이터 작품',
      tmdbId: 430001,
      posterUrl: '/metadata.jpg',
      originCountry: 'KR',
      voteCount: 1,
    });
    await fixtures.contentMetadata({
      contentId: metadataContent.id,
      description: '메타데이터 기반 설명',
      embedding: createVectorLiteral(1536, 0.01),
    });
    const kobisContent = await fixtures.content({
      title: 'KOBIS fallback 작품',
      tmdbId: 430002,
      posterUrl: '/kobis.jpg',
      originCountry: 'US',
      overview: 'KOBIS fallback 줄거리',
      voteCount: 5000,
    });
    await fixtures.ranking({
      contentId: kobisContent.id,
      title: kobisContent.title,
      source: 'kobis',
    });

    const result = await service.searchWithFilters(
      '영화 추천',
      10,
      [],
      {},
      embedding,
    );

    expect(result.map((item) => item.contentId)).toEqual([
      metadataContent.id,
      kobisContent.id,
    ]);
    expect(result[0].description).toBe('메타데이터 기반 설명');
    expect(result[1].description).toBe('KOBIS fallback 줄거리');
  });

  it('임베딩 생성 실패 시 인기도 기반 fallback으로 반환해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const lowVoteContent = await fixtures.content({
      title: '낮은 인기도 작품',
      tmdbId: 440001,
      posterUrl: '/low-vote.jpg',
      originCountry: 'KR',
      voteCount: 1,
    });
    const highVoteContent = await fixtures.content({
      title: '높은 인기도 작품',
      tmdbId: 440002,
      posterUrl: '/high-vote.jpg',
      originCountry: 'KR',
      voteCount: 10000,
    });
    await fixtures.contentMetadata({
      contentId: lowVoteContent.id,
      description: '낮은 인기도 설명',
      embedding: createVectorLiteral(1536, 0.01),
    });
    await fixtures.contentMetadata({
      contentId: highVoteContent.id,
      description: '높은 인기도 설명',
      embedding: createVectorLiteral(1536, 0.01),
    });
    metadataService.generateEmbedding.mockRejectedValueOnce(
      new Error('OpenAI API 오류'),
    );

    const result = await service.searchWithFilters('영화 추천', 10, [], {});

    expect(metadataService.generateEmbedding).toHaveBeenCalledWith('영화 추천');
    expect(result.map((item) => item.contentId)).toEqual([
      highVoteContent.id,
      lowVoteContent.id,
    ]);
  });
  it.each(['filtered', 'unfiltered'] as const)(
    '%s 검색은 실제 벡터 거리와 인기도를 함께 반영하고 제외 조건과 limit을 유지해야 한다',
    async (mode) => {
      const fixtures = createIntegrationFixtures(dataSource);
      const ids: number[] = [];
      // cosine만 정렬하면 A>B>C, 인기도만 정렬하면 C>A/B다.
      // 기존0.7*cosine + min(log(votes+1)/10,0.3)에서는 A>C>B다.
      for (const [title, cosine, voteCount] of [
        ['거리 우선', 1, 1],
        ['중간 거리', 0.8, 1],
        ['인기도 보정', 0.6, 10000],
      ] as const) {
        const content = await fixtures.content({
          title,
          voteCount,
          posterUrl: '/poster.jpg',
        });
        await fixtures.contentMetadata({
          contentId: content.id,
          embedding: JSON.stringify(createDirectionalEmbedding(cosine)),
        });
        ids.push(content.tmdbId);
      }
      const adult = await fixtures.content({
        title: '성인 제외',
        adult: true,
        voteCount: 10000,
        posterUrl: '/adult.jpg',
      });
      const excluded = await fixtures.content({
        title: '명시 제외',
        voteCount: 10000,
        posterUrl: '/excluded.jpg',
      });
      for (const content of [adult, excluded]) {
        await fixtures.contentMetadata({
          contentId: content.id,
          embedding: JSON.stringify(createDirectionalEmbedding(1)),
        });
      }
      const queryVector = createDirectionalEmbedding(1);
      const search = (limit: number) =>
        mode === 'filtered'
          ? service.searchWithFilters(
              '추천',
              limit,
              [excluded.tmdbId],
              {},
              queryVector,
            )
          : service.searchSimilar(
              '추천',
              limit,
              [excluded.tmdbId],
              queryVector,
            );
      const result = await search(10);
      expect(result.map((item) => item.tmdbId)).toEqual([
        ids[0],
        ids[2],
        ids[1],
      ]);
      expect((await search(2)).map((item) => item.tmdbId)).toEqual([
        ids[0],
        ids[2],
      ]);
      const expectedScores =
        mode === 'filtered'
          ? [0.7 + Math.log(2) / 10, 0.72, 0.56 + Math.log(2) / 10]
          : [1, 0.6, 0.8];
      result.forEach((item, index) =>
        expect(item.similarity).toBeCloseTo(expectedScores[index], 5),
      );
      expect(metadataService.generateEmbedding).not.toHaveBeenCalled();
    },
  );
});
