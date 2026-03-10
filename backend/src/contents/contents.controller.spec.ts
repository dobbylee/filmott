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
    it('should call searchContents with correct params', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      const result = await controller.search({ q: 'test', type: 'movie', page: '2' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith('test', 'movie', 2);
      expect(result).toEqual(searchResult);
    });

    it('should default page to 1 when not provided', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockContentsService.searchContents.mockResolvedValue(searchResult);

      await controller.search({ q: 'test' });

      expect(mockContentsService.searchContents).toHaveBeenCalledWith('test', undefined, 1);
    });
  });

  describe('discover', () => {
    it('should call discoverContents with correct params', async () => {
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

    it('should default type to movie', async () => {
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

  describe('getDetail', () => {
    it('should call getContentDetail with parsed tmdbId', async () => {
      const detailResult = { id: 1, tmdbId: 123, title: 'Test' };
      mockContentsService.getContentDetail.mockResolvedValue(detailResult);

      const result = await controller.getDetail('movie', 123);

      expect(mockContentsService.getContentDetail).toHaveBeenCalledWith(123, 'movie');
      expect(result).toEqual(detailResult);
    });
  });
});
