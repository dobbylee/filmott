import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly revalidateSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.revalidateSecret = this.configService.get<string>('REVALIDATE_SECRET', '');
  }

  async revalidatePath(path: string = '/'): Promise<void> {
    if (!this.revalidateSecret) return;
    try {
      const url = 'http://frontend:3000/internal/revalidate';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.revalidateSecret}`,
        },
        body: JSON.stringify({ path }),
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
}
