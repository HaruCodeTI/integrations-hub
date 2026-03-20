import { appRouter } from './routes/router';
import { env } from './config/env';
import { scheduleTokenRefreshJob } from './jobs/token-refresh.job';
import { startCampaignWorker } from './modules/campaigns/campaigns.worker';
import indexHtml from './frontend/index.html';

// /painel/* é servido via routes do Bun.serve para ativar o bundler de .tsx.
// Auth é verificada pelo cliente React (AccountSelector redireciona em 401)
// e pelas rotas /api/v2/* que exigem isAuthenticated.

const server = Bun.serve({
  port: env.PORT,
  routes: {
    '/painel': indexHtml,
    '/painel/*': indexHtml,
  },
  fetch: appRouter,
  development: process.env.NODE_ENV === 'development' ? { hmr: true } : false,
});

console.log(`Servidor em http://localhost:${server.port}`);
console.log(`Webhook em http://localhost:${server.port}/webhook`);
console.log(`Painel em http://localhost:${server.port}/painel`);

scheduleTokenRefreshJob();
startCampaignWorker();
