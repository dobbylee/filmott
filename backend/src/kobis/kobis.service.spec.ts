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
    it('should return daily box office list', async () => {
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

    it('should return empty array when no data', async () => {
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

    it('should throw error on API failure', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.getDailyBoxOffice('20260309')).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getWeeklyBoxOffice', () => {
    it('should return weekly box office list', async () => {
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
