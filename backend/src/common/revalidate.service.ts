import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly revalidateSecret: string;
  private readonly frontendInternalUrl: string;

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
