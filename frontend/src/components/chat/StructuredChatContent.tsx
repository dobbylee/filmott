import ReactMarkdown from 'react-markdown';
import type { ChatStructuredContent } from '@/types/chat';

interface StructuredChatContentProps {
  content: ChatStructuredContent;
}

export default function StructuredChatContent({
  content,
}: StructuredChatContentProps) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-white/90">
      {content.intro && (
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-0 prose-strong:text-white">
          <ReactMarkdown>{content.intro}</ReactMarkdown>
        </div>
      )}

      {content.items.length > 0 && (
        <div className="space-y-3">
          {content.items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="border-l-2 border-fuchsia-400/40 pl-3"
            >
              <p className="font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-white/75">{item.description}</p>
            </div>
          ))}
        </div>
      )}

      {content.outro && (
        <p className="text-white/80">{content.outro}</p>
      )}
    </div>
  );
}
