import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Content } from '../../src/contents/content.entity';
import { EmbeddingService } from '../../src/embedding/embedding.service';
import { ContentMetadata } from '../../src/embedding/entities/content-metadata.entity';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import { createIntegrationFixtures } from './helpers/fixtures';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

function createDirectionalVector(
  primaryIndex: number,
  secondaryIndex?: number,
): string {
  const values = Array.from({ length: 1536 }, () => 0);
  values[primaryIndex] = 1;
  if (secondaryIndex !== undefined) values[secondaryIndex] = 0.1;
  return `[${values.join(',')}]`;
}

describeWithDb('related contents integration', () => {
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let service: EmbeddingService;

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
    moduleRef = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: getRepositoryToken(ContentMetadata),
          useValue: dataSource.getRepository(ContentMetadata),
        },
        {
          provide: getRepositoryToken(Content),
          useValue: dataSource.getRepository(Content),
        },
        {
          provide: ConfigService,
          useValue: { get: () => '' },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(EmbeddingService);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('저장된 source embedding으로만 현재 작품과 색인 불가 후보를 제외해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const common = {
      posterUrl: '/poster.jpg',
      overview: '색인 가치가 있는 줄거리',
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
      voteCount: 100,
      adult: false,
    };
    const source = await fixtures.content({
      ...common,
      tmdbId: 620001,
      title: '기준 작품',
    });
    const relatedByVote = await fixtures.content({
      ...common,
      tmdbId: 620002,
      title: '투표 기반 관련작',
      voteAverage: 8.8,
    });
    const relatedByRanking = await fixtures.content({
      ...common,
      tmdbId: 620003,
      title: '랭킹 기반 관련작',
      voteCount: 0,
    });
    await fixtures.ranking({ contentId: relatedByRanking.id });
    const withoutSignal = await fixtures.content({
      ...common,
      tmdbId: 620004,
      title: '신호 없음',
      voteCount: 0,
      watchProviders: null,
    });
    const adult = await fixtures.content({
      ...common,
      tmdbId: 620005,
      title: '성인물',
      adult: true,
    });
    const withoutPoster = await fixtures.content({
      ...common,
      tmdbId: 620006,
      title: '포스터 없음',
      posterUrl: null,
    });
    const withBlankPoster = await fixtures.content({
      ...common,
      tmdbId: 620007,
      title: '공백 포스터',
      posterUrl: '   ',
    });
    const wrongType = await fixtures.content({
      ...common,
      tmdbId: 620008,
      contentType: 'tv',
      title: '다른 타입',
    });
    const wrongGenre = await fixtures.content({
      ...common,
      tmdbId: 620009,
      title: '다른 장르',
      genres: [{ id: 35, name: '코미디' }],
    });

    await Promise.all([
      fixtures.contentMetadata({
        contentId: source.id,
        embedding: createDirectionalVector(0),
      }),
      fixtures.contentMetadata({
        contentId: relatedByVote.id,
        embedding: createDirectionalVector(0),
      }),
      fixtures.contentMetadata({
        contentId: relatedByRanking.id,
        embedding: createDirectionalVector(0, 2),
      }),
      fixtures.contentMetadata({
        contentId: withoutSignal.id,
        embedding: createDirectionalVector(0, 3),
      }),
      fixtures.contentMetadata({
        contentId: adult.id,
        embedding: createDirectionalVector(0, 4),
      }),
      fixtures.contentMetadata({
        contentId: withoutPoster.id,
        embedding: createDirectionalVector(0, 5),
      }),
      fixtures.contentMetadata({
        contentId: withBlankPoster.id,
        embedding: createDirectionalVector(0, 6),
      }),
      fixtures.contentMetadata({
        contentId: wrongType.id,
        embedding: createDirectionalVector(0),
      }),
      fixtures.contentMetadata({
        contentId: wrongGenre.id,
        embedding: createDirectionalVector(0),
      }),
    ]);

    const result = await service.findRelatedContents(source.tmdbId, 'movie', 6);

    expect(result.map((item) => item.tmdbId)).toEqual([
      relatedByVote.tmdbId,
      relatedByRanking.tmdbId,
    ]);
    expect(result[0]).toEqual({
      tmdbId: relatedByVote.tmdbId,
      contentType: 'movie',
      title: '투표 기반 관련작',
      posterUrl: '/poster.jpg',
      releaseDate: '2026-01-01',
      voteAverage: 8.8,
    });
    expect(result.map((item) => item.tmdbId)).not.toContain(wrongType.tmdbId);
    expect(result.map((item) => item.tmdbId)).not.toContain(wrongGenre.tmdbId);
  });

  it('source metadata가 없어도 인기 후보와 최신 무메타 후보를 최대 두 개 반환해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const source = await fixtures.content({
      tmdbId: 620010,
      posterUrl: '/source.jpg',
      releaseDate: new Date('2025-01-01T00:00:00.000Z'),
    });
    const freshNewest = await fixtures.content({
      tmdbId: 620011,
      title: '최신 무메타 1',
      posterUrl: '/fresh-1.jpg',
      releaseDate: new Date('2026-03-01T00:00:00.000Z'),
    });
    const freshSecond = await fixtures.content({
      tmdbId: 620012,
      title: '최신 무메타 2',
      posterUrl: '/fresh-2.jpg',
      releaseDate: new Date('2026-02-01T00:00:00.000Z'),
    });
    const freshThird = await fixtures.content({
      tmdbId: 620013,
      title: '최신 무메타 3',
      posterUrl: '/fresh-3.jpg',
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    const popular = await fixtures.content({
      tmdbId: 620014,
      title: '인기 메타 작품',
      posterUrl: '/popular.jpg',
      voteCount: 50_000,
    });
    await fixtures.contentMetadata({
      contentId: popular.id,
      embedding: createDirectionalVector(1),
    });

    const result = await service.findRelatedContents(source.tmdbId, 'movie', 6);

    expect(result.map((item) => item.tmdbId)).toEqual([
      popular.tmdbId,
      freshNewest.tmdbId,
      freshSecond.tmdbId,
    ]);
    expect(result.map((item) => item.tmdbId)).not.toContain(freshThird.tmdbId);
  });

  it('source가 색인 기준 미달이면 embedding이 있어도 조회하지 않아야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const source = await fixtures.content({
      tmdbId: 620020,
      posterUrl: '/source.jpg',
      voteCount: 0,
      watchProviders: null,
    });
    const candidate = await fixtures.content({
      tmdbId: 620021,
      posterUrl: '/candidate.jpg',
      voteCount: 100,
    });
    await fixtures.contentMetadata({
      contentId: source.id,
      embedding: createDirectionalVector(0),
    });
    await fixtures.contentMetadata({
      contentId: candidate.id,
      embedding: createDirectionalVector(0, 1),
    });

    await expect(
      service.findRelatedContents(source.tmdbId, 'movie', 6),
    ).resolves.toEqual([]);
  });

  it('source 포스터가 공백이면 embedding과 품질 신호가 있어도 조회하지 않아야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const source = await fixtures.content({
      tmdbId: 620030,
      posterUrl: '   ',
      voteCount: 100,
    });
    const candidate = await fixtures.content({
      tmdbId: 620031,
      posterUrl: '/candidate.jpg',
      voteCount: 100,
    });
    await fixtures.contentMetadata({
      contentId: source.id,
      embedding: createDirectionalVector(0),
    });
    await fixtures.contentMetadata({
      contentId: candidate.id,
      embedding: createDirectionalVector(0, 1),
    });

    await expect(
      service.findRelatedContents(source.tmdbId, 'movie', 6),
    ).resolves.toEqual([]);
  });
});
