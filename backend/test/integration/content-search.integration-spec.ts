import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ContentSearchService } from '../../src/chat/content-search.service';
import { EmbeddingService } from '../../src/chat/embedding.service';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import {
  createIntegrationFixtures,
  createVectorLiteral,
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
  let service: ContentSearchService;
  const embeddingService = {
    generateEmbedding: jest.fn<Promise<number[]>, [string]>(),
  };

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
    moduleRef = await Test.createTestingModule({
      providers: [
        ContentSearchService,
        { provide: DataSource, useValue: dataSource },
        { provide: EmbeddingService, useValue: embeddingService },
      ],
    }).compile();
    service = moduleRef.get(ContentSearchService);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
    embeddingService.generateEmbedding.mockResolvedValue(embedding);
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
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
      adult: true,
    });
    const excludedByType = await fixtures.content({
      title: 'TV 콘텐츠',
      tmdbId: 420002,
      contentType: 'tv',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
    });
    const excludedByCountry = await fixtures.content({
      title: '미국 콘텐츠',
      tmdbId: 420003,
      originCountry: 'US',
      genres: [{ id: 18, name: '드라마' }],
      watchProviders: netflixProviders,
    });
    const excludedByGenre = await fixtures.content({
      title: '공포 콘텐츠',
      tmdbId: 420004,
      originCountry: 'KR',
      genres: [{ id: 27, name: '공포' }],
      watchProviders: netflixProviders,
    });
    const excludedByDirector = await fixtures.content({
      title: '제외 감독 콘텐츠',
      tmdbId: 420005,
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      director: '제외 감독',
      watchProviders: netflixProviders,
    });
    const excludedByTmdbId = await fixtures.content({
      title: 'TMDB 제외 콘텐츠',
      tmdbId: 420006,
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
      originCountry: 'KR',
      voteCount: 1,
    });
    const highVoteContent = await fixtures.content({
      title: '높은 인기도 작품',
      tmdbId: 440002,
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
    embeddingService.generateEmbedding.mockRejectedValueOnce(
      new Error('OpenAI API 오류'),
    );

    const result = await service.searchWithFilters('영화 추천', 10, [], {});

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      '영화 추천',
    );
    expect(result.map((item) => item.contentId)).toEqual([
      highVoteContent.id,
      lowVoteContent.id,
    ]);
  });
});
