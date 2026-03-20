import { appRouter } from './routes/router';
import { env } from './config/env';
import { scheduleTokenRefreshJob } from './jobs/token-refresh.job';

// Nota: /painel/* e servido diretamente pelo appRouter (com auth check via isAuthenticated).
// Nao usar routes do Bun.serve para /painel — o fetch: appRouter cuida de autenticacao
// antes de servir o HTML, e routes tem precedencia sobre fetch (bypassa auth).

const server = Bun.serve({
  port: env.PORT,
  fetch: appRouter,
  development: process.env.NODE_ENV !== 'production' ? { hmr: true } : undefined,
});

console.log(`Servidor em http://localhost:${server.port}`);
console.log(`Webhook em http://localhost:${server.port}/webhook`);
console.log(`Painel em http://localhost:${server.port}/painel`);

scheduleTokenRefreshJob();