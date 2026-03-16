import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 인증: Bearer 토큰(백엔드 배치) 또는 Referer(admin 페이지) 허용
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace('Bearer ', '');
  const referer = request.headers.get('referer') || '';
  const isAdmin = referer.includes('/admin');

  if (!isAdmin && (!secret || secret !== process.env.REVALIDATE_SECRET)) {
    return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
  }

  let path = '/';
  try {
    const body: { path?: string } = await request.json();
    if (body.path) path = body.path;
  } catch {
    // body 파싱 실패 시 기본값 '/' 사용
  }

  revalidatePath(path);
  return NextResponse.json({ revalidated: true, path });
}
