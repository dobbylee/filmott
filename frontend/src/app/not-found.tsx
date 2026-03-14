import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <h1 className="text-6xl font-black text-white/20">404</h1>
        <p className="mt-4 text-lg text-white/50">페이지를 찾을 수 없습니다</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white"
        >
          메인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
