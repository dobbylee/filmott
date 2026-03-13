'use client';

interface SectionErrorProps {
  title: string;
}

export default function SectionError({ title }: SectionErrorProps) {
  return (
    <section className="py-8">
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-white/50">{title}</h2>
      <div className="p-8 border border-red-500/20 rounded-2xl bg-red-500/5 text-center">
        <p className="text-red-400/80">데이터를 불러올 수 없습니다.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg border border-red-500/30 px-4 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </section>
  );
}
