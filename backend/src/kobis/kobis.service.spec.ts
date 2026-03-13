import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { KobisService } from './kobis.service';
import { AxiosResponse, AxiosHeaders } from 'axios';

describe('KobisService', () => {
  let service: KobisService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KobisService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<KobisService>(KobisService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailyBoxOffice', () => {
    it('일일 박스오피스 목록을 반환해야 한다', async () => {
      const mockItems = [
        {
          rank: '1',
          movieNm: 'Test Movie',
          movieCd: '12345',
          openDt: '2026-03-01',
          audiCnt: '100000',
          audiAcc: '500000',
          salesAmt: '1000000',
          salesAcc: '5000000',
        },
      ];

      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Daily',
            showRange: '20260309~20260309',
            dailyBoxOfficeList: mockItems,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getDailyBoxOffice('20260309');

      expect(result).toEqual(mockItems);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/boxoffice/searchDailyBoxOfficeList.json',
        { params: { targetDt: '20260309' } },
      );
    });

    it('데이터가 없을 때 빈 배열을 반환해야 한다', async () => {
      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Daily',
            showRange: '20260309~20260309',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getDailyBoxOffice('20260309');

      expect(result).toEqual([]);
    });

    it('API 실패 시 에러를 던져야 한다', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.getDailyBoxOffice('20260309')).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getWeeklyBoxOffice', () => {
    it('주간 박스오피스 목록을 반환해야 한다', async () => {
      const mockItems = [
        {
          rank: '1',
          movieNm: 'Weekly Movie',
          movieCd: '67890',
          openDt: '2026-02-28',
          audiCnt: '200000',
          audiAcc: '1000000',
          salesAmt: '2000000',
          salesAcc: '10000000',
        },
      ];

      const response: AxiosResponse = {
        data: {
          boxOfficeResult: {
            boxofficeType: 'Weekly',
            showRange: '20260303~20260309',
            weeklyBoxOfficeList: mockItems,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      mockHttpService.get.mockReturnValue(of(response));

      const result = await service.getWeeklyBoxOffice('20260309', '0');

      expect(result).toEqual(mockItems);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/boxoffice/searchWeeklyBoxOfficeList.json',
        { params: { targetDt: '20260309', weekGb: '0' } },
      );
    });
  });
});
