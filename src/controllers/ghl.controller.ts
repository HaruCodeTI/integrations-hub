import { env } from '../config/env';
import { ghlOAuth } from '../services/ghl-oauth.service';
import { ghlApi } from '../services/ghl-api.service';
import { sender } from '../services/sender.service';
import { db } from '../services/db.service';

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GhlController — Rotas de OAuth e webhook outbound do GHL
 *
 * Rotas:
 * - GET  /integrations/install         → Redireciona para autorização no GHL Marketplace
 * - GET  /ghl/oauth/callback  → Recebe authorization code e troca por tokens
 * - POST /ghl/webhook/outbound → Recebe mensagens enviadas via GHL Conversations UI
 * - GET  /api/ghl/locations    → Lista locations conectadas (protegido por API key)
 */
export class GhlController {

  /**
   * GET /integrations/install
   * Redireciona o admin da sub-account para o fluxo de autorização no GHL Marketplace.
   */
  static install(): Response {
    if (!env.GHL_CLIENT_ID) {
      return jsonResponse({ error: 'GHL_CLIENT_ID não configurado no .env' }, 500);
    }

    const installUrl = ghlOAuth.getInstallUrl();
    console.log(`[🔗 GHL] Redirecionando para install: ${installUrl}`);

    return new Response(null, {
      status: 302,
      headers: { Location: installUrl },
    });
  }

  /**
   * GET /ghl/oauth/callback?code=...
   * GHL redireciona aqui após o admin autorizar. Troca o code por tokens.
   */
  static async oauthCallback(url: URL): Promise<Response> {
    const code = url.searchParams.get('code');

    if (!code) {
      return new Response(GhlController.callbackErrorHTML('Código de autorização ausente'), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    try {
      console.log(`[🔑 GHL OAuth] Trocando code por tokens...`);
      const tokens = await ghlOAuth.exchangeCode(code);
      ghlOAuth.saveTokens(tokens);

      const locationId = tokens.locationId || 'desconhecido';
      const companyId = tokens.companyId || 'n/a';

      return new Response(GhlController.callbackSuccessHTML(locationId, companyId), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

    } catch (error: any) {
      console.error(`[❌ GHL OAuth] Erro no callback:`, error);
      return new Response(GhlController.callbackErrorHTML(error.message), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  /**
   * POST /ghl/webhook/outbound
   *
   * Recebe mensagens enviadas pelo agente no GHL Conversations UI.
   * Formato do payload (GHL ProviderOutboundMessage):
   * {
   *   type: "ProviderOutboundMessage",
   *   locationId: "...",
   *   contactId: "...",
   *   messageId: "...",
   *   channel: "whatsapp",
   *   messageType: "SMS",
   *   content: { text: "...", attachments: [...] },
   *   endpoint: { phone: "+5567..." }
   * }
   */
  static async handleOutbound(req: Request): Promise<Response> {
    try {
      const body = await req.json() as any;

      console.log(`[📩 GHL Outbound] Recebido:`, JSON.stringify(body).substring(0, 300));

      // Valida o tipo de evento
      if (body.type !== 'ProviderOutboundMessage') {
        console.log(`[ℹ️ GHL Outbound] Evento ignorado: ${body.type}`);
        return jsonResponse({ status: 'ignored', type: body.type });
      }

      const { locationId, contactId, messageId, content, endpoint } = body;

      if (!locationId || !content?.text || !endpoint?.phone) {
        console.warn(`[⚠️ GHL Outbound] Payload incompleto:`, body);
        return jsonResponse({ error: 'Payload incompleto — locationId, content.text e endpoint.phone são obrigatórios' }, 400);
      }

      // Busca o cliente vinculado a essa location
      const client = db.getClientByGhlLocationId(locationId);
      if (!client) {
        console.error(`[❌ GHL Outbound] Nenhum cliente vinculado à location ${locationId}`);
        return jsonResponse({ error: `Nenhum cliente configurado para location ${locationId}` }, 404);
      }

      // Normaliza o telefone (remove + e espaços)
      const to = endpoint.phone.replace(/[^0-9]/g, '');

      console.log(`[📤 GHL → WhatsApp] Enviando de "${client.name}" (${client.phone_number_id}) para ${to}: "${content.text.substring(0, 50)}..."`);

      // Envia via Meta API usando o sender centralizado
      const result = await sender.send({
        phone_number_id: client.phone_number_id,
        to,
        type: 'text',
        text: { body: content.text },
      });

      if (result.success) {
        // Atualiza status no GHL para "sent"
        try {
          await ghlApi.updateMessageStatus({
            locationId,
            messageId,
            status: 'sent',
          });
        } catch (statusError) {
          console.warn(`[⚠️ GHL] Erro ao atualizar status para sent:`, statusError);
        }

        console.log(`[✅ GHL → WhatsApp] Mensagem enviada com sucesso`);
        return jsonResponse({ status: 'sent', messageId, waMessageId: result.data?.messages?.[0]?.id });
      } else {
        // Atualiza status no GHL para "failed"
        try {
          await ghlApi.updateMessageStatus({
            locationId,
            messageId,
            status: 'failed',
            error: result.error || 'Meta API error',
          });
        } catch (statusError) {
          console.warn(`[⚠️ GHL] Erro ao atualizar status para failed:`, statusError);
        }

        console.error(`[❌ GHL → WhatsApp] Erro ao enviar:`, result.error);
        return jsonResponse({ status: 'failed', error: result.error }, 422);
      }

    } catch (error: any) {
      console.error(`[❌ GHL Outbound] Exceção:`, error);
      return jsonResponse({ error: 'Erro interno ao processar outbound', details: error.message }, 500);
    }
  }

  /**
   * GET /api/ghl/locations — Lista todas as locations conectadas (protegido por API key)
   */
  static listLocations(): Response {
    const locations = db.getAllGhlLocations();
    return jsonResponse({
      count: locations.length,
      locations: locations.map(loc => ({
        location_id: loc.location_id,
        company_id: loc.company_id,
        expires_at: loc.expires_at,
        created_at: loc.created_at,
        updated_at: loc.updated_at,
        // Não expõe tokens na API
      })),
    });
  }

  // ─── HTML pages ────────────────────────────────────────────

  private static callbackSuccessHTML(locationId: string, companyId: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GHL — Conexão Autorizada</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #22c55e; }
    p { color: #94a3b8; margin: 0.5rem 0; font-size: 0.95rem; }
    .detail { background: #0f172a; border-radius: 8px; padding: 1rem; margin-top: 1rem; font-family: monospace; font-size: 0.85rem; text-align: left; }
    .detail span { color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Conexão Autorizada!</h1>
    <p>O GoHighLevel foi conectado com sucesso ao wa-omni-gateway.</p>
    <div class="detail">
      <span>Location ID:</span> ${locationId}<br/>
      <span>Company ID:</span> ${companyId}
    </div>
    <p style="margin-top: 1.5rem; font-size: 0.85rem;">Agora cadastre um cliente no gateway vinculando essa location.</p>
  </div>
</body>
</html>`;
  }

  private static callbackErrorHTML(errorMessage: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GHL — Erro na Conexão</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #ef4444; }
    p { color: #94a3b8; margin: 0.5rem 0; font-size: 0.95rem; }
    .detail { background: #0f172a; border-radius: 8px; padding: 1rem; margin-top: 1rem; font-family: monospace; font-size: 0.85rem; color: #f87171; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Erro na Conexão</h1>
    <p>Não foi possível completar a autorização com o GoHighLevel.</p>
    <div class="detail">${errorMessage}</div>
    <p style="margin-top: 1.5rem; font-size: 0.85rem;">Tente novamente acessando <code>/integrations/install</code></p>
  </div>
</body>
</html>`;
  }
}
