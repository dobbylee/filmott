import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WARMUP_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly revalidateSecret: string;
  private readonly frontendInternalUrl: string;
  private readonly frontendWarmupUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.revalidateSecret = this.configService.get<string>(
      'REVALIDATE_SECRET',
      '',
    );
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    this.frontendInternalUrl =
      this.configService.get<string>('FRONTEND_INTERNAL_URL') ?? frontendUrl;
    this.frontendWarmupUrl =
      this.configService.get<string>('FRONTEND_WARMUP_URL') ?? frontendUrl;
  }

  private shouldWarmPath(path: string): boolean {
    return path === '/' || path.startsWith('/contents/');
  }

  private async warmPath(path: string): Promise<void> {
    if (!this.shouldWarmPath(path)) return;

    try {
      const url = `${this.frontendWarmupUrl}${path}`;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (attempt > 1) {
          await sleep(WARMUP_RETRY_DELAY_MS);
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-filmott-cache-warmup': '1',
          },
          redirect: 'follow',
        });

        if (!response.ok) {
          this.logger.warn(`캐시 워밍 실패 (${path}): HTTP ${response.status}`);
          return;
        }

        await response.arrayBuffer();
      }

      this.logger.log(`캐시 워밍 완료 (${path})`);
    } catch {
      this.logger.warn(`캐시 워밍 실패 (${path}, 무시)`);
    }
  }

  async revalidatePath(path: string = '/', tags: string[] = []): Promise<void> {
    if (!this.revalidateSecret) return;
    try {
      const url = `${this.frontendInternalUrl}/internal/revalidate`;
      const body: { path: string; tags?: string[] } = { path };
      if (tags.length > 0) {
        body.tags = tags;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.revalidateSecret}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        this.logger.warn(`캐시 갱신 실패 (${path}): HTTP ${response.status}`);
        return;
      }
      this.logger.log(`캐시 갱신 완료 (${path})`);
      await this.warmPath(path);
    } catch {
      this.logger.warn(`캐시 갱신 실패 (${path}, 무시)`);
    }
  }

  async revalidatePaths(paths: string[]): Promise<void> {
    const uniquePaths = [
      ...new Set(paths.filter((path): path is string => Boolean(path))),
    ];
    await Promise.allSettled(
      uniquePaths.map((path) => this.revalidatePath(path)),
    );
  }
}
