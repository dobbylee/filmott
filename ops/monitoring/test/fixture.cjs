const http = require('node:http');
const role = process.env.FIXTURE_ROLE;
const notifications = [];
let state = { scrapeFail: false, remoteFail: false, heapHigh: false };
http.createServer((req, res) => {
  if (req.url === '/control' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const next = JSON.parse(Buffer.concat(chunks).toString());
      if (!Object.entries(next).every(([key,value]) => ['scrapeFail','remoteFail','heapHigh'].includes(key) && typeof value === 'boolean')) {
        res.writeHead(400).end(); return;
      }
      state = { ...state, ...next };
      res.end('ok');
    });
    return;
  }
  if (role === 'gateway') {
    if (req.url === '/notifications' && req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        notifications.push(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(200).end('ok');
      });
      return;
    }
    if (req.url === '/notifications' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(notifications));
      return;
    }
    if (req.url !== '/api/v1/write') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== 'Basic ' + Buffer.from('fixture:fixture-token').toString('base64')) {
      res.writeHead(401).end(); return;
    }
    if (state.remoteFail) { res.writeHead(503).end('fixture unavailable'); return; }
    const upstream = http.request('http://prometheus:9090/api/v1/write', { method:'POST',headers:req.headers }, response => {
      res.writeHead(response.statusCode); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502).end(); });
    req.pipe(upstream);
    return;
  }
  if (req.url === '/api/') { res.end('Hello World!'); return; }
  if (req.url !== '/api/internal/metrics') { res.writeHead(404).end(); return; }
  if (state.scrapeFail) { res.writeHead(503).end(); return; }
  const heap = state.heapHigh ? 95 : role === 'green' ? 60 : 40;
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.end(`filmott_node_heap_used_bytes ${heap}\nfilmott_node_heap_limit_bytes 100\nfilmott_process_resident_memory_bytes 150\nprivate_metric{user_id="fixture-private"} 1\n`);
}).listen(role === 'gateway' ? 8080 : 3001, '0.0.0.0');
