import {
  Body,
  Controller,
  INestApplication,
  UnauthorizedException,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { ContentsController } from '../src/contents/contents.controller';
import { ContentsService } from '../src/contents/contents.service';
import { Content } from '../src/contents/content.entity';
import { TmdbService } from '../src/tmdb/tmdb.service';
import { RevalidateService } from '../src/common/revalidate.service';
import { ReviewsController } from '../src/reviews/reviews.controller';
import { ReviewsService } from '../src/reviews/reviews.service';
import { ReviewCommentsService } from '../src/reviews/review-comments.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

class ValidationProbeDto {
  @IsString()
  name!: string;
}

@Controller('validation-probe')
class ValidationProbeController {
  @Post()
  create(@Body() dto: ValidationProbeDto) {
    return dto;
  }
}

describe('HTTP application boundaries (e2e)', () => {
  let app: INestApplication<App>;
  const contentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const tmdbService = {
    getDetails: jest.fn(),
    searchByType: jest.fn(),
    discoverByFilters: jest.fn(),
    getPersonDetail: jest.fn(),
    getPersonCredits: jest.fn(),
  };
  const revalidateService = {
    revalidatePath: jest.fn(),
    revalidatePaths: jest.fn(),
  };
  const reviewsService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMyReview: jest.fn(),
    getLikedReviewIdsByIds: jest.fn(),
    getLikedReviewIds: jest.fn(),
    getRecentReviews: jest.fn(),
    findByContent: jest.fn(),
    findByUser: jest.fn(),
    getContentStats: jest.fn(),
    toggleLike: jest.fn(),
  };
  const reviewCommentsService = {
    create: jest.fn(),
    delete: jest.fn(),
    findByReview: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [
        ContentsController,
        ReviewsController,
        ValidationProbeController,
      ],
      providers: [
        ContentsService,
        { provide: getRepositoryToken(Content), useValue: contentRepo },
        { provide: TmdbService, useValue: tmdbService },
        { provide: RevalidateService, useValue: revalidateService },
        { provide: ReviewsService, useValue: reviewsService },
        { provide: ReviewCommentsService, useValue: reviewCommentsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('전역 prefix /api 아래에서만 라우트를 제공해야 한다', async () => {
    await request(app.getHttpServer())
      .post('/validation-probe')
      .send({
        name: 'filmott',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/validation-probe')
      .send({
        name: 'filmott',
      })
      .expect(201);
  });

  it('ValidationPipe가 허용되지 않은 body 필드를 거부해야 한다', async () => {
    await request(app.getHttpServer())
      .post('/api/validation-probe')
      .send({
        name: 'filmott',
        extra: 'blocked',
      })
      .expect(400);
  });

  it('인증이 필요한 리뷰 작성 API는 토큰이 없으면 401을 반환해야 한다', async () => {
    await request(app.getHttpServer())
      .post('/api/reviews')
      .send({
        contentId: 1,
        rating: 8,
      })
      .expect(401);
  });

  it('비정상 TMDB ID는 외부 API 호출 전에 거부해야 한다', async () => {
    await request(app.getHttpServer()).get('/api/contents/movie/0').expect(400);

    expect(tmdbService.getDetails).not.toHaveBeenCalled();
    expect(contentRepo.findOne).not.toHaveBeenCalled();
  });
});
