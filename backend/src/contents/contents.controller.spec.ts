import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ContentsController } from './contents.controller';
import { ContentsService } from './contents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('ContentsController', () => {
  let controller: ContentsController;

  const mockContentsService = {
    searchContents: jest.fn(),
    getContentDetail: jest.fn(),
    getRelatedContents: jest.fn(),
    discoverContents: jest.fn(),
    getPersonDetail: jest.fn(),
    getPersonCredits: jest.fn(),
    getSitemapContents: jest.fn(),
    getGoogleSitemapContents: jest.fn(),
    toggleAdult: jest.fn(),
    getAdultContents: jest.fn(),
    blockPersonContents: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [{ provide: ContentsService, useValue: mockContentsService }],
    }).compile();

    controller = module.get<ContentsController>(ContentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('올바른 파라미터로 searchContents를 호출해야 한다', async () => {
      const searchResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test', type: 'movie', page: '2' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith(
        'test',
        'movie',
        2,
      );
    });

    it('page가 제공되지 않으면 기본값 1을 사용해야 한다', async () => {
      const searchResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith(
        'test',
        undefined,
        1,
      );
    });
  });

  describe('discover', () => {
    it('올바른 파라미터로 discoverContents를 호출해야 한다', async () => {
      const discoverResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      mockContentsService.discoverContents.mockResolvedValue(discoverResult);

      await controller.discover({
        type: 'tv',
        genres: '18,28',
        providers: '8',
        year: '2024',
        page: '3',
      });

      expect(mockContentsService.discoverContents).toHaveBeenCalledWith('tv', {
        genres: '18,28',
        providers: '8',
        year: 2024,
        sort: undefined,
        page: 3,
      });
    });

    it('type 기본값을 movie로 사용해야 한다', async () => {
      const discoverResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      mockContentsService.discoverContents.mockResolvedValue(discoverResult);

      await controller.discover({});

      expect(mockContentsService.discoverContents).toHaveBeenCalledWith(
        'movie',
        {
          genres: undefined,
          providers: undefined,
          year: undefined,
          sort: undefined,
          page: 1,
        },
      );
    });
  });

  describe('getDetail', () => {
    it('파싱된 tmdbId로 getContentDetail을 호출해야 한다', async () => {
      const detailResult = { id: 1, tmdbId: 123, title: 'Test' };
      mockContentsService.getContentDetail.mockResolvedValue(detailResult);

      await controller.getDetail('movie', 123);

      expect(mockContentsService.getContentDetail).toHaveBeenCalledWith(
        123,
        'movie',
      );
    });

    it('type이 movie/tv가 아니면 BadRequestException을 던져야 한다', async () => {
      await expect(controller.getDetail('anime', 123)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getDetail('series', 456)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('공개 상세 조회에는 ThrottlerGuard를 적용하지 않아야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ContentsController.prototype.getDetail,
      );
      expect(guards).toBeUndefined();
    });
  });

  describe('getGoogleSitemapContents', () => {
    it('허용된 Google sitemap cohort를 서비스에 전달해야 한다', async () => {
      const contents = [{ tmdbId: 123, contentType: 'movie' }];
      mockContentsService.getGoogleSitemapContents.mockResolvedValue(contents);

      await expect(
        controller.getGoogleSitemapContents('filmott-signal'),
      ).resolves.toEqual(contents);
      expect(mockContentsService.getGoogleSitemapContents).toHaveBeenCalledWith(
        'filmott-signal',
      );
    });

    it('알 수 없는 Google sitemap cohort를 거부해야 한다', async () => {
      await expect(
        controller.getGoogleSitemapContents('unknown'),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockContentsService.getGoogleSitemapContents,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getRelated', () => {
    it('파싱된 조회 조건으로 관련 작품 조회를 호출해야 한다', async () => {
      const related = [{ tmdbId: 124, contentType: 'movie' }];
      mockContentsService.getRelatedContents.mockResolvedValue(related);

      await expect(controller.getRelated('movie', 123, 6)).resolves.toEqual(
        related,
      );
      expect(mockContentsService.getRelatedContents).toHaveBeenCalledWith(
        123,
        'movie',
        6,
      );
    });

    it('type이 movie/tv가 아니면 거부해야 한다', async () => {
      await expect(controller.getRelated('anime', 123, 6)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockContentsService.getRelatedContents).not.toHaveBeenCalled();
    });

    it('TV 관련 작품의 작은 limit도 그대로 서비스에 전달해야 한다', async () => {
      mockContentsService.getRelatedContents.mockResolvedValue([]);

      await controller.getRelated('tv', 456, 1);

      expect(mockContentsService.getRelatedContents).toHaveBeenCalledWith(
        456,
        'tv',
        1,
      );
    });
  });

  describe('toggleAdult', () => {
    it('JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ContentsController.prototype.toggleAdult,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });
  });

  describe('getAdultContents', () => {
    it('JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ContentsController.prototype.getAdultContents,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });
  });

  describe('blockPersonContents', () => {
    it('JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ContentsController.prototype.blockPersonContents,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });
  });
});
