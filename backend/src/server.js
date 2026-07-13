import { createServer } from 'node:http';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const app = createApp();
const server = createServer((request, response) => {
  app(request, response).catch((error) => {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } }));
    console.error(error);
  });
});

server.listen(port, () => {
  console.log(`Recruitment backend listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => app.close());
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
