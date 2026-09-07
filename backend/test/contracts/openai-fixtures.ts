export function completionResponse(content: string): Response {
  return Response.json({
    id: 'contract-completion',
    object: 'chat.completion',
    created: 1,
    model: 'gpt-5.6-luna',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  });
}

export function streamFrame(
  content: string | null,
  finish: string | null = null,
): string {
  return `data: ${JSON.stringify({
    id: 'contract-stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-5.6-luna',
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { role: 'assistant', content },
        finish_reason: finish,
      },
    ],
  })}\n\n`;
}

export function streamResponse(content: string, finish = 'stop'): Response {
  return new Response(
    streamFrame(content) + streamFrame(null, finish) + 'data: [DONE]\n\n',
    {
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

export function embeddingResponse(encoding: unknown): Response {
  const values = Array.from({ length: 1536 }, () => 0.01);
  return Response.json({
    object: 'list',
    model: 'text-embedding-3-small',
    data: [
      {
        object: 'embedding',
        index: 0,
        embedding:
          encoding === 'base64'
            ? Buffer.from(new Float32Array(values).buffer).toString('base64')
            : values,
      },
    ],
    usage: { prompt_tokens: 1, total_tokens: 1 },
  });
}
