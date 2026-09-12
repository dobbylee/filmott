import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RelatedContentsController } from './related-contents.controller';
import { RelatedContentService } from './related-content.service';

describe('관련 작품 조회 controller', () => {
  let controller: RelatedContentsController;
  const mockRelatedContentService = { findRelatedContents: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelatedContentsController],
      providers: [
        { provide: RelatedContentService, useValue: mockRelatedContentService },
      ],
    }).compile();
    controller = module.get(RelatedContentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('관련 작품 HTTP 진입점', () => {
    it('파싱된 조회 조건으로 관련 작품 조회를 호출해야 한다', async () => {
      const related = [{ tmdbId: 124, contentType: 'movie' }];
      mockRelatedContentService.findRelatedContents.mockResolvedValue(related);

      await expect(controller.getRelated('movie', 123, 6)).resolves.toEqual(
        related,
      );
      expect(
        mockRelatedContentService.findRelatedContents,
      ).toHaveBeenCalledWith(123, 'movie', 6);
    });

    it('type이 movie/tv가 아니면 거부해야 한다', async () => {
      await expect(controller.getRelated('anime', 123, 6)).rejects.toThrow(
        BadRequestException,
      );
      expect(
        mockRelatedContentService.findRelatedContents,
      ).not.toHaveBeenCalled();
    });

    it('TV 관련 작품의 작은 limit도 그대로 서비스에 전달해야 한다', async () => {
      mockRelatedContentService.findRelatedContents.mockResolvedValue([]);

      await controller.getRelated('tv', 456, 1);

      expect(
        mockRelatedContentService.findRelatedContents,
      ).toHaveBeenCalledWith(456, 'tv', 1);
    });
  });
});
