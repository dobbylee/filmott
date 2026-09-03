import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Content } from '../../src/contents/content.entity';
import { ContentsService } from '../../src/contents/contents.service';
import { RevalidateService } from '../../src/common/revalidate.service';
import { TmdbService } from '../../src/tmdb/tmdb.service';
import { EmbeddingService } from '../../src/embedding/embedding.service';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import { createIntegrationFixtures } from './helpers/fixtures';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

describeWithDb('contents indexability integration', () => {
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let service: ContentsService;

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
    moduleRef = await Test.createTestingModule({
      providers: [
        ContentsService,
        {
          provide: getRepositoryToken(Content),
          useValue: dataSource.getRepository(Content),
        },
        {
          provide: TmdbService,
          useValue: {},
        },
        {
          provide: RevalidateService,
          useValue: {},
        },
        {
          provide: EmbeddingService,
          useValue: {},
        },
      ],
    }).compile();
    service = moduleRef.get(ContentsService);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('상세와 sitemap이 동일한 품질 신호로 작품을 판정해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const common = {
      posterUrl: '/poster.jpg',
      overview: '검색에 제공할 줄거리',
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
      voteCount: 0,
      watchProviders: null,
    };
    const byVote = await fixtures.content({
      ...common,
      tmdbId: 610001,
      voteCount: 100,
    });
    const byReview = await fixtures.content({
      ...common,
      tmdbId: 610002,
    });
    const reviewer = await fixtures.user();
    await fixtures.review({ userId: reviewer.id, contentId: byReview.id });
    const byRanking = await fixtures.content({
      ...common,
      tmdbId: 610003,
    });
    await fixtures.ranking({ contentId: byRanking.id });
    const byProvider = await fixtures.content({
      ...common,
      tmdbId: 610004,
      watchProviders: {
        flatrate: [
          {
            provider_id: 8,
            provider_name: 'Netflix',
            logo_path: '/netflix.png',
          },
        ],
      },
    });
    const withoutSignal = await fixtures.content({
      ...common,
      tmdbId: 610005,
    });
    const withoutOverview = await fixtures.content({
      ...common,
      tmdbId: 610006,
      overview: '   ',
      voteCount: 1000,
    });

    await expect(
      service.getContentDetail(byVote.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: true });
    await expect(
      service.getContentDetail(byReview.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: true });
    await expect(
      service.getContentDetail(byRanking.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: true });
    await expect(
      service.getContentDetail(byProvider.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: true });
    await expect(
      service.getContentDetail(withoutSignal.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: false });
    await expect(
      service.getContentDetail(withoutOverview.tmdbId, 'movie'),
    ).resolves.toMatchObject({ searchIndexable: false });

    const sitemapTmdbIds = new Set(
      (await service.getSitemapContents()).map((item) => item.tmdbId),
    );
    expect(sitemapTmdbIds).toEqual(
      new Set([
        byVote.tmdbId,
        byReview.tmdbId,
        byRanking.tmdbId,
        byProvider.tmdbId,
      ]),
    );
  });

  it('Google sitemap 관찰 cohort를 신호와 투표 구간별로 겹치지 않게 분리해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const common = {
      posterUrl: '/poster.jpg',
      overview: '검색에 제공할 줄거리',
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
      voteCount: 0,
      watchProviders: null,
    };
    const provider = {
      flatrate: [
        {
          provider_id: 8,
          provider_name: 'Netflix',
          logo_path: '/netflix.png',
        },
      ],
    };
    const byReview = await fixtures.content({
      ...common,
      tmdbId: 620001,
      voteCount: 5000,
      watchProviders: provider,
    });
    const reviewer = await fixtures.user();
    await fixtures.review({ userId: reviewer.id, contentId: byReview.id });
    const contentUpdatedAt = new Date('2026-09-04T00:00:00.000Z');
    await dataSource
      .getRepository(Content)
      .update(byReview.id, { updatedAt: contentUpdatedAt });
    const byRanking = await fixtures.content({
      ...common,
      tmdbId: 620002,
    });
    await fixtures.ranking({ contentId: byRanking.id });
    const providerHigh = await fixtures.content({
      ...common,
      tmdbId: 620003,
      voteCount: 2500,
      watchProviders: provider,
    });
    const providerHighBoundary = await fixtures.content({
      ...common,
      tmdbId: 620004,
      voteCount: 2000,
      watchProviders: provider,
    });
    const providerMidHighBoundary = await fixtures.content({
      ...common,
      tmdbId: 620005,
      voteCount: 1999,
      watchProviders: provider,
    });
    const providerMidLowBoundary = await fixtures.content({
      ...common,
      tmdbId: 620006,
      voteCount: 1000,
      watchProviders: provider,
    });
    await fixtures.content({
      ...common,
      tmdbId: 620007,
      voteCount: 999,
      watchProviders: provider,
    });
    await fixtures.content({
      ...common,
      tmdbId: 620008,
      voteCount: 5000,
      watchProviders: provider,
      adult: true,
    });
    await fixtures.content({
      ...common,
      tmdbId: 620009,
      overview: '   ',
      voteCount: 5000,
      watchProviders: provider,
    });

    const filmottSignal =
      await service.getGoogleSitemapContents('filmott-signal');
    const providerHighItems =
      await service.getGoogleSitemapContents('provider-high');
    const providerMidItems =
      await service.getGoogleSitemapContents('provider-mid');
    const filmottIds = new Set(filmottSignal.map((item) => item.tmdbId));
    const providerHighIds = new Set(
      providerHighItems.map((item) => item.tmdbId),
    );
    const providerMidIds = new Set(providerMidItems.map((item) => item.tmdbId));

    expect(filmottIds).toEqual(new Set([byReview.tmdbId, byRanking.tmdbId]));
    expect(
      filmottSignal.find((item) => item.tmdbId === byReview.tmdbId)
        ?.lastModified,
    ).toEqual(contentUpdatedAt);
    expect(providerHighIds).toEqual(
      new Set([providerHigh.tmdbId, providerHighBoundary.tmdbId]),
    );
    expect(providerMidIds).toEqual(
      new Set([providerMidHighBoundary.tmdbId, providerMidLowBoundary.tmdbId]),
    );
    expect(providerHighItems.map((item) => item.tmdbId)).toEqual([
      providerHigh.tmdbId,
      providerHighBoundary.tmdbId,
    ]);
    expect(
      [...filmottIds].filter(
        (tmdbId) => providerHighIds.has(tmdbId) || providerMidIds.has(tmdbId),
      ),
    ).toEqual([]);
    expect(
      [...providerHighIds].filter((tmdbId) => providerMidIds.has(tmdbId)),
    ).toEqual([]);
  });
});
