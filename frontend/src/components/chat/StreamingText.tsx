'use client';

import ReactMarkdown from 'react-markdown';

interface StreamingTextProps {
  text: string;
}

export default function StreamingText({ text }: StreamingTextProps) {
  return (
    <div className="text-sm leading-relaxed text-white/90 prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-white">
      <ReactMarkdown>{text}</ReactMarkdown>
      <span className="inline-block w-1.5 h-4 ml-0.5 bg-fuchsia-400 animate-pulse rounded-sm align-text-bottom" />
    </div>
  );
}
