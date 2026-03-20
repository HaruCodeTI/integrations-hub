// src/modules/dashboard/dashboard.routes.ts
import { DashboardService } from './dashboard.service';
import { env } from '../../config/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function dashboardRoutes(req: Request, method: string, pathname: string): Response | null {
  const match = pathname.match(/^\/api\/v2\/dashboard\/([^/]+)$/);
  if (match && method === 'GET') {
    try {
      const metrics = DashboardService.getMetrics(match[1]);
      return json(metrics);
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  if (pathname === '/api/v2/config' && method === 'GET') {
    const base_url = env.GATEWAY_PUBLIC_URL || `http://localhost:${env.PORT}`;
    return json({
      version: process.env.npm_package_version ?? '1.0.0',
      base_url,
      webhook_url: `${base_url}/webhook`,
    });
  }

  return null;
}
