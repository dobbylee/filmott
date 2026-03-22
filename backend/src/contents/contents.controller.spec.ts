import { Test, TestingModule } from '@nestjs/testing';
import { ContentsController } from './contents.controller';
import { ContentsService } from './contents.service';

describe('ContentsController', () => {
  let controller: ContentsController;
  let contentsService: ContentsService;

  const mockContentsService = {
    searchContents: jest.fn(),
    getContentDetail: jest.fn(),
    discoverContents: jest.fn(),
    getPersonDetail: jest.fn(),
    getPersonCredits: jest.fn(),
    getSitemapContents: jest.fn(),
    toggleAdult: jest.fn(),
    getAdultContents: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [
        { provide: ContentsService, useValue: mockContentsService },
      ],
    }).compile();

    controller = module.get<ContentsController>(ContentsController);
    contentsService = module.get<ContentsService>(ContentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('올바른 파라미터로 searchContents를 호출해야 한다', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      const result = await controller.search({ q: 'test', type: 'movie', page: '2' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith('test', 'movie', 2);
      expect(result).toEqual(searchResult);
    });

    it('page가 제공되지 않으면 기본값 1을 사용해야 한다', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith('test', undefined, 1);
    });
  });

  describe('discover', () => {
    it('올바른 파라미터로 discoverContents를 호출해야 한다', async () => {
      const discoverResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.discoverContents.mockResolvedValue(discoverResult);

      const result = await controller.discover({
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
        page: 3,
      });
      expect(result).toEqual(discoverResult);
    });

    it('type 기본값을 movie로 사용해야 한다', async () => {
      const discoverResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.discoverContents.mockResolvedValue(discoverResult);

      await controller.discover({});

      expect(mockContentsService.discoverContents).toHaveBeenCalledWith('movie', {
        genres: undefined,
        providers: undefined,
        year: undefined,
        page: 1,
      });
    });
  });

  describe('getPersonDetail', () => {
    it('personId로 getPersonDetail을 호출해야 한다', async () => {
      const personData = {
        id: 17419,
        name: 'Bryan Cranston',
        profile_path: '/profile.jpg',
        biography: 'An actor.',
        birthday: '1956-03-07',
        place_of_birth: 'Hollywood, California, USA',
        known_for_department: 'Acting',
      };
      mockContentsService.getPersonDetail.mockResolvedValue(personData);

      const result = await controller.getPersonDetail(17419);

      expect(mockContentsService.getPersonDetail).toHaveBeenCalledWith(17419);
      expect(result).toEqual(personData);
    });
  });

  describe('getPersonCredits', () => {
    it('personId로 getPersonCredits를 호출해야 한다', async () => {
      const creditsData = {
        cast: [{ id: 1, media_type: 'movie', title: 'Movie 1' }],
        crew: [],
      };
      mockContentsService.getPersonCredits.mockResolvedValue(creditsData);

      const result = await controller.getPersonCredits(17419);

      expect(mockContentsService.getPersonCredits).toHaveBeenCalledWith(17419);
      expect(result).toEqual(creditsData);
    });
  });

  describe('getSitemapContents', () => {
    it('getSitemapContents를 호출하고 결과를 반환해야 한다', async () => {
      const sitemapData = [
        { tmdbId: 123, contentType: 'movie', updatedAt: new Date('2026-03-15') },
        { tmdbId: 456, contentType: 'tv', updatedAt: new Date('2026-03-14') },
      ];
      mockContentsService.getSitemapContents.mockResolvedValue(sitemapData);

      const result = await controller.getSitemapContents();

      expect(mockContentsService.getSitemapContents).toHaveBeenCalled();
      expect(result).toEqual(sitemapData);
    });

    it('콘텐츠가 없으면 빈 배열을 반환해야 한다', async () => {
      mockContentsService.getSitemapContents.mockResolvedValue([]);

      const result = await controller.getSitemapContents();

      expect(result).toEqual([]);
    });
  });

  describe('toggleAdult', () => {
    it('올바른 파라미터로 toggleAdult를 호출해야 한다', async () => {
      const updatedContent = { id: 1, tmdbId: 123, contentType: 'movie', title: 'Test', adult: true };
      mockContentsService.toggleAdult.mockResolvedValue(updatedContent);

      const result = await controller.toggleAdult({
        tmdbId: 123,
        contentType: 'movie',
        adult: true,
      });

      expect(mockContentsService.toggleAdult).toHaveBeenCalledWith(123, 'movie', true);
      expect(result).toEqual(updatedContent);
    });

    it('차단 해제 시 adult: false로 호출해야 한다', async () => {
      const updatedContent = { id: 1, tmdbId: 456, contentType: 'tv', title: 'Test TV', adult: false };
      mockContentsService.toggleAdult.mockResolvedValue(updatedContent);

      const result = await controller.toggleAdult({
        tmdbId: 456,
        contentType: 'tv',
        adult: false,
      });

      expect(mockContentsService.toggleAdult).toHaveBeenCalledWith(456, 'tv', false);
      expect(result).toEqual(updatedContent);
    });
  });

  describe('getAdultContents', () => {
    it('차단된 콘텐츠 목록을 반환해야 한다', async () => {
      const adultList = [
        { id: 1, tmdbId: 123, contentType: 'movie', title: 'Adult Movie', posterUrl: '/poster.jpg' },
        { id: 2, tmdbId: 456, contentType: 'tv', title: 'Adult TV', posterUrl: null },
      ];
      mockContentsService.getAdultContents.mockResolvedValue(adultList);

      const result = await controller.getAdultContents();

      expect(mockContentsService.getAdultContents).toHaveBeenCalled();
      expect(result).toEqual(adultList);
    });

    it('차단된 콘텐츠가 없으면 빈 배열을 반환해야 한다', async () => {
      mockContentsService.getAdultContents.mockResolvedValue([]);

      const result = await controller.getAdultContents();

      expect(result).toEqual([]);
    });
  });

  describe('getDetail', () => {
    it('파싱된 tmdbId로 getContentDetail을 호출해야 한다', async () => {
      const detailResult = { id: 1, tmdbId: 123, title: 'Test' };
      mockContentsService.getContentDetail.mockResolvedValue(detailResult);

      const result = await controller.getDetail('movie', 123);

      expect(mockContentsService.getContentDetail).toHaveBeenCalledWith(123, 'movie');
      expect(result).toEqual(detailResult);
    });
  });
});
