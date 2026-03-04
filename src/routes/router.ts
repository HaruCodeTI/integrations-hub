import { WebhookController } from '../controllers/webhook.controller';
import { ApiController } from '../controllers/api.controller';
import { GhlController } from '../controllers/ghl.controller';
import { validateApiKey, unauthorizedResponse } from '../middlewares/apiAuth';
import { privacyPolicyHTML } from '../pages/privacy';
import { termsOfUseHTML } from '../pages/terms';
import { getScalarHTML } from '../docs/scalar';
import { openApiSpec } from '../docs/openapi';

const htmlResponse = (html: string) =>
  new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 });

/**
 * Extrai o ID de um path como /api/clients/:id
 */
function extractPathId(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const id = rest.replace(/\/$/, '');
  return id || null;
}

export const appRouter = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  // ─── Rotas Públicas ──────────────────────────────────────

  if (method === "GET" && pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", uptime: process.uptime() }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (method === "GET" && pathname === "/privacy") {
    return htmlResponse(privacyPolicyHTML);
  }

  if (method === "GET" && pathname === "/terms") {
    return htmlResponse(termsOfUseHTML);
  }

  // ─── Documentação API (Scalar) ────────────────────────────

  if (method === "GET" && pathname === "/docs") {
    return htmlResponse(getScalarHTML());
  }

  if (method === "GET" && pathname === "/openapi.json") {
    return new Response(JSON.stringify(openApiSpec), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  // ─── Webhook Meta (público, protegido por HMAC) ─────────

  if (pathname === "/webhook") {
    if (method === "GET") {
      return WebhookController.verify(req, url);
    }
    if (method === "POST") {
      return await WebhookController.handleMessage(req);
    }
  }

  // ─── Integrations (LeadConnector/GHL) ────────────────────

  // GET /integrations/install?client_id=xxx — Redireciona para autorização no Marketplace
  if (method === "GET" && pathname === "/integrations/install") {
    return GhlController.install(url);
  }

  // GET /integrations/oauth/callback — Callback do OAuth
  if (method === "GET" && pathname === "/integrations/oauth/callback") {
    return await GhlController.oauthCallback(url);
  }

  // POST /integrations/webhook/outbound — Recebe mensagens enviadas via CRM UI
  if (method === "POST" && pathname === "/integrations/webhook/outbound") {
    return await GhlController.handleOutbound(req);
  }

  // ─── API Protegida (requer GATEWAY_API_KEY) ──────────────

  if (pathname.startsWith("/api/")) {
    if (!validateApiKey(req)) {
      return unauthorizedResponse();
    }

    // POST /api/send — Envio de mensagens
    if (method === "POST" && pathname === "/api/send") {
      return await ApiController.sendMessage(req);
    }

    // GET /api/clients — Listar clientes
    if (method === "GET" && pathname === "/api/clients") {
      return ApiController.listClients();
    }

    // POST /api/clients — Criar cliente
    if (method === "POST" && pathname === "/api/clients") {
      return await ApiController.createClient(req);
    }

    // PUT /api/clients/:id — Atualizar cliente
    if (method === "PUT" && pathname.startsWith("/api/clients/")) {
      const id = extractPathId(pathname, "/api/clients/");
      if (id) return await ApiController.updateClient(req, id);
    }

    // DELETE /api/clients/:id — Desativar cliente
    if (method === "DELETE" && pathname.startsWith("/api/clients/")) {
      const id = extractPathId(pathname, "/api/clients/");
      if (id) return ApiController.deleteClient(id);
    }

    // GET /api/ghl/locations — Listar locations GHL conectadas
    if (method === "GET" && pathname === "/api/ghl/locations") {
      return GhlController.listLocations();
    }

    return new Response(JSON.stringify({ error: "Rota API não encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
};
