import { ContentCatalogService } from './services/content-catalog.service';
import { ContentIndexingService } from './services/content-indexing.service';
import { AdultContentService } from './services/adult-content.service';
import { ContentDiscoveryService } from './services/content-discovery.service';
import { PersonCatalogService } from './services/person-catalog.service';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ContentsController } from './contents.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('ContentsController', () => {
  let controller: ContentsController;

  const mockContentServices = {
    searchContents: jest.fn(),
    getContentDetail: jest.fn(),
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
      providers: [
        { provide: ContentCatalogService, useValue: mockContentServices },
        { provide: ContentIndexingService, useValue: mockContentServices },
        { provide: AdultContentService, useValue: mockContentServices },
        { provide: ContentDiscoveryService, useValue: mockContentServices },
        { provide: PersonCatalogService, useValue: mockContentServices },
      ],
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
      mockContentServices.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test', type: 'movie', page: '2' });

      expect(mockContentServices.searchContents).toHaveBeenCalledWith(
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
      mockContentServices.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test' });

      expect(mockContentServices.searchContents).toHaveBeenCalledWith(
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
      mockContentServices.discoverContents.mockResolvedValue(discoverResult);

      await controller.discover({
        type: 'tv',
        genres: '18,28',
        providers: '8',
        year: '2024',
        page: '3',
      });

      expect(mockContentServices.discoverContents).toHaveBeenCalledWith('tv', {
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
      mockContentServices.discoverContents.mockResolvedValue(discoverResult);

      await controller.discover({});

      expect(mockContentServices.discoverContents).toHaveBeenCalledWith(
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
      mockContentServices.getContentDetail.mockResolvedValue(detailResult);

      await controller.getDetail('movie', 123);

      expect(mockContentServices.getContentDetail).toHaveBeenCalledWith(
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
      mockContentServices.getGoogleSitemapContents.mockResolvedValue(contents);

      await expect(
        controller.getGoogleSitemapContents('filmott-signal'),
      ).resolves.toEqual(contents);
      expect(mockContentServices.getGoogleSitemapContents).toHaveBeenCalledWith(
        'filmott-signal',
      );
    });

    it('알 수 없는 Google sitemap cohort를 거부해야 한다', async () => {
      await expect(
        controller.getGoogleSitemapContents('unknown'),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockContentServices.getGoogleSitemapContents,
      ).not.toHaveBeenCalled();
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
