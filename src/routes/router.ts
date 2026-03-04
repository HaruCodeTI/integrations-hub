import { WebhookController } from '../controllers/webhook.controller';
import { privacyPolicyHTML } from '../pages/privacy';
import { termsOfUseHTML } from '../pages/terms';

const htmlResponse = (html: string) =>
  new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 });

export const appRouter = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", uptime: process.uptime() }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (req.method === "GET" && url.pathname === "/privacy") {
    return htmlResponse(privacyPolicyHTML);
  }

  if (req.method === "GET" && url.pathname === "/terms") {
    return htmlResponse(termsOfUseHTML);
  }

  if (url.pathname === "/webhook") {
    if (req.method === "GET") {
      return WebhookController.verify(req, url);
    }
    if (req.method === "POST") {
      return await WebhookController.handleMessage(req);
    }
  }

  return new Response("Not Found", { status: 404 });
};
