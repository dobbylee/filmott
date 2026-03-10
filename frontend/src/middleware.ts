import { NextResponse } from 'next/server';

// 인증은 localStorage 기반이므로 middleware에서 처리할 수 없음.
// 클라이언트 측에서 인증을 처리하도록 middleware를 단순화.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
