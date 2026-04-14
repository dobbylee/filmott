import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';

// S3Client의 send 메서드를 mock
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => params),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => params),
  };
});

describe('R2StorageService', () => {
  let service: R2StorageService;

  const mockConfigValues: Record<string, string> = {
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_URL: 'https://test.r2.dev',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2StorageService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const value = mockConfigValues[key];
              if (!value) throw new Error(`Missing config: ${key}`);
              return value;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<R2StorageService>(R2StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPublicUrl', () => {
    it('설정된 Public URL을 반환해야 한다', () => {
      expect(service.getPublicUrl()).toBe('https://test.r2.dev');
    });
  });

  describe('upload', () => {
    it('파일을 R2에 업로드하고 공개 URL을 반환해야 한다', async () => {
      mockSend.mockResolvedValue({});
      const buffer = Buffer.from('test-image');

      const result = await service.upload(
        'profiles/test.webp',
        buffer,
        'image/webp',
      );

      expect(result).toBe('https://test.r2.dev/profiles/test.webp');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'profiles/test.webp',
          Body: buffer,
          ContentType: 'image/webp',
        }),
      );
    });
  });

  describe('delete', () => {
    it('R2에서 파일을 삭제해야 한다', async () => {
      mockSend.mockResolvedValue({});

      await service.delete('profiles/test.webp');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'profiles/test.webp',
        }),
      );
    });
  });
});
