'use client';

interface StreamingTextProps {
  text: string;
}

export default function StreamingText({ text }: StreamingTextProps) {
  return (
    <p className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
      {text}
      <span className="inline-block w-1.5 h-4 ml-0.5 bg-fuchsia-400 animate-pulse rounded-sm align-text-bottom" />
    </p>
  );
}
