'use client';

export default function SentryTestPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <button
        onClick={() => { throw new Error('Sentry test error from frontend'); }}
        className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
      >
        Sentry 테스트 에러 발생
      </button>
    </div>
  );
}
