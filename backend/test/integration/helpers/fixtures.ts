import { DataSource, type DeepPartial } from 'typeorm';
import { AuthProvider } from '../../../src/users/enums/auth-provider.enum';
import { UserRole } from '../../../src/users/enums/user-role.enum';
import { UserStatus } from '../../../src/users/enums/user-status.enum';
import { User } from '../../../src/users/user.entity';
import { Content } from '../../../src/contents/content.entity';
import { Ranking } from '../../../src/rankings/ranking.entity';
import { Watchlist } from '../../../src/watchlist/watchlist.entity';
import { Review } from '../../../src/reviews/review.entity';
import { ReviewLike } from '../../../src/reviews/review-like.entity';
import { ReviewComment } from '../../../src/reviews/review-comment.entity';
import { ContentMetadata } from '../../../src/chat/entities/content-metadata.entity';

export function createIntegrationFixtures(dataSource: DataSource) {
  let sequence = 1;

  const next = (prefix: string) => `${prefix}_${sequence++}`;

  return {
    async user(overrides: DeepPartial<User> = {}): Promise<User> {
      const nickname = next('user');
      return dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
          nickname,
          email: `${nickname}@example.com`,
          password: null,
          provider: AuthProvider.LOCAL,
          providerId: null,
          profileImage: null,
          status: UserStatus.ACTIVE,
          role: UserRole.USER,
          subscribedOtts: [],
          ...overrides,
        }),
      );
    },

    async content(overrides: DeepPartial<Content> = {}): Promise<Content> {
      const id = sequence++;
      return dataSource.getRepository(Content).save(
        dataSource.getRepository(Content).create({
          tmdbId: 100000 + id,
          contentType: 'movie',
          title: `테스트 콘텐츠 ${id}`,
          originalTitle: `Test Content ${id}`,
          posterUrl: null,
          backdropUrl: null,
          overview: '통합 테스트용 콘텐츠입니다.',
          releaseDate: new Date('2026-01-01T00:00:00.000Z'),
          voteAverage: 8.1,
          voteCount: 1000,
          genres: [{ id: 18, name: '드라마' }],
          runtime: 120,
          director: '테스트 감독',
          originCountry: 'KR',
          watchProviders: null,
          credits: [],
          adult: false,
          ...overrides,
        }),
      );
    },

    async ranking(overrides: DeepPartial<Ranking>): Promise<Ranking> {
      return dataSource.getRepository(Ranking).save(
        dataSource.getRepository(Ranking).create({
          source: 'kobis',
          category: 'daily-box-office',
          rank: sequence++,
          targetDate: '2026-05-01',
          title: '테스트 랭킹',
          posterUrl: null,
          audienceCount: 1000,
          ...overrides,
        }),
      );
    },

    async watchlist(overrides: DeepPartial<Watchlist>): Promise<Watchlist> {
      return dataSource.getRepository(Watchlist).save(
        dataSource.getRepository(Watchlist).create({
          status: 'want_to_watch',
          watchedAt: null,
          ...overrides,
        }),
      );
    },

    async review(overrides: DeepPartial<Review>): Promise<Review> {
      return dataSource.getRepository(Review).save(
        dataSource.getRepository(Review).create({
          rating: 8,
          comment: '통합 테스트 리뷰',
          likesCount: 0,
          ...overrides,
        }),
      );
    },

    async reviewLike(overrides: DeepPartial<ReviewLike>): Promise<ReviewLike> {
      return dataSource
        .getRepository(ReviewLike)
        .save(dataSource.getRepository(ReviewLike).create(overrides));
    },

    async reviewComment(
      overrides: DeepPartial<ReviewComment>,
    ): Promise<ReviewComment> {
      return dataSource.getRepository(ReviewComment).save(
        dataSource.getRepository(ReviewComment).create({
          content: '통합 테스트 댓글',
          ...overrides,
        }),
      );
    },

    async contentMetadata(
      overrides: DeepPartial<ContentMetadata>,
    ): Promise<ContentMetadata> {
      return dataSource.getRepository(ContentMetadata).save(
        dataSource.getRepository(ContentMetadata).create({
          description: '통합 테스트 메타데이터',
          embedding: createVectorLiteral(),
          ...overrides,
        }),
      );
    },
  };
}

export function createVectorLiteral(size = 1536, value = 0.01): string {
  return `[${Array.from({ length: size }, () => value).join(',')}]`;
}
