import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.E2E_FIXTURE_BACKEND_PORT ?? 3101);
const now = '2026-05-01T00:00:00.000Z';

const user = {
  id: 1,
  nickname: 'e2e-user',
  email: 'e2e@example.com',
  role: 'user',
  status: 'active',
  subscribedOtts: [],
};

const content = {
  id: 1,
  tmdbId: 496243,
  contentType: 'movie',
  title: 'Fixture 영화',
  originalTitle: 'Fixture Movie',
  overview: 'Playwright가 사용하는 결정적 fixture 작품입니다.',
  releaseDate: '2026-05-01',
  voteAverage: 8.4,
  genres: [{ id: 18, name: '드라마' }],
  runtime: 120,
  adult: false,
  director: 'Fixture 감독',
  watchProviders: null,
  credits: [],
  createdAt: now,
  updatedAt: now,
};

const recentReview = {
  id: 10,
  userId: user.id,
  contentId: content.id,
  rating: 8,
  comment: '결정적 fixture 리뷰',
  likesCount: 0,
  commentsCount: 0,
  createdAt: now,
  updatedAt: now,
  user,
  content,
};

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  setCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${host}:${port}`);

  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/users/me') {
    sendJson(response, 200, user);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/rankings') {
    sendJson(response, 200, []);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/reviews/recent') {
    sendJson(response, 200, [recentReview]);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/contents/movie/496243'
  ) {
    sendJson(response, 200, content);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/reviews/1/stats') {
    sendJson(response, 200, { averageRating: null, reviewCount: 0 });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/reviews') {
    sendJson(response, 200, { data: [], total: 0, page: 1, totalPages: 0 });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/reviews/my') {
    sendJson(response, 200, null);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/reviews/liked-ids'
  ) {
    sendJson(response, 200, []);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/watchlist/me/status'
  ) {
    sendJson(response, 200, {
      status: 'watched',
      watchlistId: 100,
      watchedAt: '2026-05-01',
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/reviews') {
    request.resume();
    request.on('end', () => {
      sendJson(response, 201, {
        id: 900,
        contentId: content.id,
        rating: 8,
        comment: '브라우저 e2e 리뷰',
        likesCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    return;
  }

  sendJson(response, 404, { message: 'Fixture route not found' });
});

server.listen(port, host);

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
