import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Content } from '../../src/contents/content.entity';
import { ContentsService } from '../../src/contents/contents.service';
import { RevalidateService } from '../../src/common/revalidate.service';
import { TmdbService } from '../../src/tmdb/tmdb.service';
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
});
