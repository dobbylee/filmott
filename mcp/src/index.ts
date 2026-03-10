#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTmdbTools } from './tools/tmdb.js';
import { registerKobisTools } from './tools/kobis.js';

if (!process.env.TMDB_API_KEY) {
  process.stderr.write('오류: TMDB_API_KEY 환경변수가 설정되지 않았습니다.\n');
  process.exit(1);
}

if (!process.env.KOBIS_API_KEY) {
  process.stderr.write('오류: KOBIS_API_KEY 환경변수가 설정되지 않았습니다.\n');
  process.exit(1);
}

const server = new McpServer({
  name: 'filmott-mcp',
  version: '1.0.0',
});

registerTmdbTools(server);
registerKobisTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
