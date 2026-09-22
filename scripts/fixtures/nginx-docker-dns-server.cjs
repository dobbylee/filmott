const http = require('node:http');

// 인스턴스 고유 응답으로 잘못된 IP의 HTTP 200을 성공으로 세지 않는다.
const identity = process.env.FIXTURE_ID;
if (!identity) throw new Error('FIXTURE_ID가 필요합니다.');
for (const port of [3000, 3001]) {
  http.createServer((request, response) => {
    if (identity.startsWith('green') && request.url.startsWith('/_next/static/old.js')) {
      response.writeHead(404).end('missing-old-asset');
      return;
    }
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.stringify({
        identity,
        port,
        method: request.method,
        url: request.url,
        host: request.headers.host,
        cookie: request.headers.cookie,
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      });
      if (request.url.startsWith('/api/chat/')) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(`event: text\ndata: ${body}\n\n`);
        setTimeout(() => response.end('event: done\ndata: {}\n\n'), 100);
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
      }
    });
  }).listen(port, '0.0.0.0');
}
