import { ConfigService } from '@nestjs/config';
import { APIUserAbortError } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { z } from 'zod';
import { streamFrame } from '../../../test/contracts/openai-fixtures';
import { OpenAIChatClient } from './openai-chat.client';
import { OpenAISdkProvider } from './openai-sdk.provider';

describe('실제 SDK structured stream 격리', () => {
  it('한 요청 취소 후에도 다른 요청의 parsed 이벤트와 정상 종료를 보존해야 한다', async () => {
    const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              bodies.push(controller);
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      });
    const sdk = new OpenAISdkProvider(
      new ConfigService({ OPENAI_API_KEY: 'fixture-key' }),
    );
    const client = new OpenAIChatClient(sdk);
    const firstSignal = new AbortController();
    const secondSignal = new AbortController();
    const schema = z.object({ message: z.string() });
    const params = {
      model: 'fixture',
      messages: [],
      response_format: zodResponseFormat(schema, 'fixture_message'),
    };
    // 타입 추론을 잃으면 이 대입과 parsed 접근이 컴파일에 실패한다.
    const first: ChatCompletionStream<z.infer<typeof schema>> = client.stream(
      params,
      { signal: firstSignal.signal },
    );
    const second: ChatCompletionStream<z.infer<typeof schema>> = client.stream(
      params,
      { signal: secondSignal.signal },
    );
    const canceled = expect(first.finalChatCompletion()).rejects.toBeInstanceOf(
      APIUserAbortError,
    );
    const completed = second.finalChatCompletion();
    const firstDelta = new Promise<void>((resolve) =>
      first.once('content.delta', () => resolve()),
    );
    const secondDelta = new Promise<void>((resolve) =>
      second.once('content.delta', () => resolve()),
    );
    const parsed: unknown[] = [];
    second.on('content.delta', (event) => parsed.push(event.parsed));
    const encoder = new TextEncoder();
    try {
      await Promise.all([first.emitted('connect'), second.emitted('connect')]);
      bodies[0].enqueue(encoder.encode(streamFrame('{"message":"first')));
      bodies[1].enqueue(encoder.encode(streamFrame('{"message":"second')));
      await Promise.all([firstDelta, secondDelta]);
      firstSignal.abort();
      // fixture body도 닫아 SDK reader가 계속 대기하지 않도록 한다.
      bodies[0].close();
      await canceled;
      expect(secondSignal.signal.aborted).toBe(false);
      bodies[1].enqueue(
        encoder.encode(
          streamFrame(' done"}') +
            streamFrame(null, 'stop') +
            'data: [DONE]\n\n',
        ),
      );
      bodies[1].close();
      const response = await completed;
      expect(response.choices[0].message.parsed?.message).toBe('second done');
      expect(response.choices[0].finish_reason).toBe('stop');
      expect(parsed).toContainEqual({ message: 'second' });
      expect(parsed).toContainEqual({ message: 'second done' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      first.abort();
      second.abort();
      fetchSpy.mockRestore();
      await Promise.allSettled([canceled, completed]);
    }
  });
});
