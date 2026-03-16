import { appRouter } from './routes/router';
import { env } from './config/env';
import { scheduleTokenRefreshJob } from './jobs/token-refresh.job';

const server = Bun.serve({
  port: env.PORT,
  fetch: appRouter,
});

console.log(`🚀 [wa-omni-gateway] rodando perfeitamente em http://localhost:${server.port}`);
console.log(`📡 Rota de Webhook aguardando em http://localhost:${server.port}/webhook`);

scheduleTokenRefreshJob();