import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly revalidateSecret: string;

  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.revalidateSecret = this.configService.get<string>(
      'REVALIDATE_SECRET',
      '',
    );
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_INTERNAL_URL') ??
      this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  private shouldWarmPath(path: string): boolean {
    return path === '/' || path.startsWith('/contents/');
  }

  private async warmPath(path: string): Promise<void> {
    if (!this.shouldWarmPath(path)) return;

    try {
      const response = await fetch(`${this.frontendUrl}${path}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'x-filmott-cache-warmup': '1',
        },
      });

      if (!response.ok) {
        this.logger.warn(`캐시 워밍 실패 (${path}): HTTP ${response.status}`);
        return;
      }

      this.logger.log(`캐시 워밍 완료 (${path})`);
    } catch {
      this.logger.warn(`캐시 워밍 실패 (${path}, 무시)`);
    }
  }

  async revalidatePath(path: string = '/'): Promise<void> {
    if (!this.revalidateSecret) return;
    try {
      const url = `${this.frontendUrl}/internal/revalidate`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.revalidateSecret}`,
        },
        body: JSON.stringify({ path }),
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
