import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRevalidatePath = vi.fn();
const mockRevalidateTag = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    private _body: string | null;
    private _headers: Map<string, string>;

    constructor(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
      this._body = init?.body ?? null;
      this._headers = new Map(Object.entries(init?.headers ?? {}));
    }

    headers = {
      get: (key: string) => this._headers.get(key) ?? null,
    };

    async json() {
      if (!this._body) throw new Error('No body');
      return JSON.parse(this._body);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

describe('revalidate route', () => {
  let POST: typeof import('@/app/internal/revalidate/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.REVALIDATE_SECRET = 'test-secret';
    const mod = await import('@/app/internal/revalidate/route');
    POST = mod.POST;
  });

  function createRequest(options: {
    authorization?: string;
    body?: Record<string, unknown>;
  }) {
    const headers: Record<string, string> = {};
    if (options.authorization) {
      headers['authorization'] = options.authorization;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest } = require('next/server');
    return new NextRequest('http://localhost:3000/internal/revalidate', {
      method: 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  it('유효한 Bearer 토큰으로 기본 경로를 revalidate해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer test-secret',
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revalidated: true, path: '/', tags: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('허용된 경로를 revalidate해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer test-secret',
      body: { path: '/contents' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revalidated: true, path: '/contents', tags: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/contents');
  });

  it('허용된 동적 contents 경로를 revalidate해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer test-secret',
      body: { path: '/contents/movie/550' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      revalidated: true,
      path: '/contents/movie/550',
      tags: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/contents/movie/550');
  });

  it('허용된 태그를 함께 revalidate해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer test-secret',
      body: { path: '/', tags: ['rankings', 'recent-reviews', 'admin'] },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      revalidated: true,
      path: '/',
      tags: ['rankings', 'recent-reviews'],
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('recent-reviews', {
      expire: 0,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('허용되지 않은 경로는 기본값 /로 fallback해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer test-secret',
      body: { path: '/admin/secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revalidated: true, path: '/', tags: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('Bearer 토큰 없이 요청 시 401을 반환해야 한다', async () => {
    const req = createRequest({});

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('잘못된 Bearer 토큰으로 요청 시 401을 반환해야 한다', async () => {
    const req = createRequest({
      authorization: 'Bearer wrong-secret',
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('Referer만으로는 인증이 허용되지 않아야 한다', async () => {
    const headers: Record<string, string> = {
      referer: 'https://filmott.kr/admin',
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost:3000/internal/revalidate', {
      method: 'POST',
      headers,
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
