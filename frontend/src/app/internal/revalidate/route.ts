import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_TAGS = new Set(['rankings']);

function isAllowedPath(path: string): boolean {
  return path === '/' || path === '/contents' || path.startsWith('/contents/');
}

function getAllowedTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string' && ALLOWED_TAGS.has(tag));
}

export async function POST(request: NextRequest) {
  // 인증: Bearer 토큰만 허용 (배치 전용, Docker 내부 네트워크에서 호출)
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
  }

  let path = '/';
  let tags: string[] = [];
  try {
    const body = (await request.json()) as unknown;
    if (
      typeof body === 'object' &&
      body !== null &&
      'path' in body &&
      typeof body.path === 'string' &&
      isAllowedPath(body.path)
    ) {
      path = body.path;
    }
    if (typeof body === 'object' && body !== null && 'tags' in body) {
      tags = getAllowedTags(body.tags);
    }
  } catch {
    // body 파싱 실패 시 기본값 '/' 사용
  }

  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
  revalidatePath(path);
  return NextResponse.json({ revalidated: true, path, tags });
}
