'use client';

interface ErrorWithRetryProps {
  message: string;
  title?: string;
  onRetry?: () => void;
}

export default function ErrorWithRetry({
  message,
  title,
  onRetry,
}: ErrorWithRetryProps) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
      {title && <h2 className="text-lg font-bold">{title}</h2>}
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        onClick={onRetry ?? (() => window.location.reload())}
        className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white/60 hover:bg-white/5 transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}
