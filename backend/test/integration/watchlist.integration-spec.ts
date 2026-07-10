import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WatchlistModule } from '../../src/watchlist/watchlist.module';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../src/auth/decorators/current-user.decorator';
import { ContentsService } from '../../src/contents/contents.service';
import { Watchlist } from '../../src/watchlist/watchlist.entity';
import {
  hasIntegrationDatabaseConfig,
  resetIntegrationDatabase,
} from './helpers/database';
import { createIntegrationFixtures } from './helpers/fixtures';
import {
  createIntegrationApp,
  requestIntegrationApp,
} from './helpers/test-app';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

describeWithDb('watchlist integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let currentUser: JwtPayload;
  const contentsService = {
    findOrFetchByTmdbId: jest.fn(),
  };
  const authGuard: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
      request.user = currentUser;
      return true;
    },
  };

  beforeAll(async () => {
    app = await createIntegrationApp({
      imports: [WatchlistModule],
      configure: (builder) =>
        builder
          .overrideGuard(JwtAuthGuard)
          .useValue(authGuard)
          .overrideProvider(ContentsService)
          .useValue(contentsService),
    });
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('리뷰가 있는 작품은 POST upsert로 want_to_watch 전환할 수 없어야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const user = await fixtures.user();
    const content = await fixtures.content();
    const watchlist = await fixtures.watchlist({
      userId: user.id,
      contentId: content.id,
      status: 'watched',
      watchedAt: '2026-05-01',
    });
    await fixtures.review({ userId: user.id, contentId: content.id });
    currentUser = { id: user.id, nickname: user.nickname, role: user.role };
    contentsService.findOrFetchByTmdbId.mockResolvedValue(content);

    const response = await requestIntegrationApp(
      app,
      'POST',
      '/api/watchlist',
      {
        tmdbId: content.tmdbId,
        contentType: content.contentType,
        status: 'want_to_watch',
      },
    );

    expect(response.status).toBe(400);
    const unchanged = await dataSource
      .getRepository(Watchlist)
      .findOneByOrFail({ id: watchlist.id });
    expect(unchanged.status).toBe('watched');
    expect(unchanged.watchedAt).toBe('2026-05-01');
  });

  it('리뷰가 있는 작품은 PATCH로 want_to_watch 전환할 수 없어야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const user = await fixtures.user();
    const content = await fixtures.content();
    const watchlist = await fixtures.watchlist({
      userId: user.id,
      contentId: content.id,
      status: 'watched',
      watchedAt: '2026-05-01',
    });
    await fixtures.review({ userId: user.id, contentId: content.id });
    currentUser = { id: user.id, nickname: user.nickname, role: user.role };

    const response = await requestIntegrationApp(
      app,
      'PATCH',
      `/api/watchlist/${watchlist.id}`,
      { status: 'want_to_watch' },
    );

    expect(response.status).toBe(400);
    const unchanged = await dataSource
      .getRepository(Watchlist)
      .findOneByOrFail({ id: watchlist.id });
    expect(unchanged.status).toBe('watched');
    expect(unchanged.watchedAt).toBe('2026-05-01');
  });
});
