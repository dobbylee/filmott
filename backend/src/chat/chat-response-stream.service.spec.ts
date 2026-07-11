import type OpenAI from 'openai';
import { ChatResponseStreamService } from './chat-response-stream.service';

function createStream(
  content: string,
): AsyncIterable<OpenAI.Chat.ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        choices: [{ delta: { content }, finish_reason: null, index: 0 }],
      } as OpenAI.Chat.ChatCompletionChunk;
      yield {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      } as OpenAI.Chat.ChatCompletionChunk;
    },
  };
}

describe('ChatResponseStreamService', () => {
  const service = new ChatResponseStreamService();

  async function collectText(content: string): Promise<string> {
    const chunks: string[] = [];
    await service.emitStreamingText(createStream(content), (event, data) => {
      if (event === 'text') {
        chunks.push((data as { content: string }).content);
      }
    });
    return chunks.join('');
  }

  it('연속된 추천 작품 사이에 빈 줄을 하나 추가해야 한다', async () => {
    await expect(
      collectText('**기생충** - 긴장감이 좋아요.\n**괴물** - 여운이 깊어요.'),
    ).resolves.toBe(
      '**기생충** - 긴장감이 좋아요.\n\n**괴물** - 여운이 깊어요.',
    );
  });

  it('추천 작품 사이에 이미 빈 줄이 있으면 중복 추가하지 않아야 한다', async () => {
    await expect(
      collectText('**기생충** - 긴장감이 좋아요.\n\n**괴물** - 여운이 깊어요.'),
    ).resolves.toBe(
      '**기생충** - 긴장감이 좋아요.\n\n**괴물** - 여운이 깊어요.',
    );
  });
});
