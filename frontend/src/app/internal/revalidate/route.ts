import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PATHS = new Set(['/', '/contents']);

export async function POST(request: NextRequest) {
  // 인증: Bearer 토큰만 허용 (배치 전용, Docker 내부 네트워크에서 호출)
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
  }

  let path = '/';
  try {
    const body: { path?: string } = await request.json();
    if (body.path && ALLOWED_PATHS.has(body.path)) {
      path = body.path;
    }
  } catch {
    // body 파싱 실패 시 기본값 '/' 사용
  }

  revalidatePath(path);
  return NextResponse.json({ revalidated: true, path });
}
