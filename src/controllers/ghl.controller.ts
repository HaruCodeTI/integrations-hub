import { env } from '../config/env';
import { ghlOAuth } from '../services/ghl-oauth.service';
import { ghlApi } from '../services/ghl-api.service';
import { sender } from '../services/sender.service';
import { db } from '../services/db.service';
import { router } from '../services/router.service';

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
   * GET /integrations/install?client_id=xxx
   * Redireciona o admin da sub-account para o fluxo de autorização no GHL Marketplace.
   * Se client_id for fornecido, auto-vincula a location ao client após o OAuth.
   */
  static install(url: URL): Response {
    if (!env.GHL_CLIENT_ID) {
      return jsonResponse({ error: 'GHL_CLIENT_ID não configurado no .env' }, 500);
    }

    const clientId = url.searchParams.get('client_id') || undefined;

    // Valida o client_id se fornecido
    if (clientId) {
      const client = db.getClientById(clientId);
      if (!client) {
        return jsonResponse({ error: `Cliente não encontrado: ${clientId}` }, 404);
      }
      if (client.client_type !== 'ghl') {
        return jsonResponse({ error: `Cliente "${client.name}" não é do tipo GHL. Atualize o client_type para "ghl" primeiro.` }, 400);
      }
      if (client.ghl_location_id) {
        return jsonResponse({
          error: `Cliente "${client.name}" já está vinculado à location ${client.ghl_location_id}. Use PUT /api/clients/${clientId} para desvincular primeiro.`,
        }, 409);
      }
      console.log(`[🔗 GHL] Install com auto-vinculação para client "${client.name}" (${clientId})`);
    }

    const installUrl = ghlOAuth.getInstallUrl(clientId);
    console.log(`[🔗 GHL] Redirecionando para install: ${installUrl}`);

    return new Response(null, {
      status: 302,
      headers: { Location: installUrl },
    });
  }

  /**
   * GET /integrations/oauth/callback?code=...&state=client_id
   * GHL redireciona aqui após o admin autorizar. Troca o code por tokens.
   * Se state contiver um client_id, auto-vincula a location ao client.
   */
  static async oauthCallback(url: URL): Promise<Response> {
    const code = url.searchParams.get('code');
    const clientId = url.searchParams.get('state') || null; // client_id passado via state

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

      // Auto-vinculação: se veio client_id no state, vincula a location ao client
      let linkedClientName: string | null = null;
      if (clientId && locationId !== 'desconhecido') {
        const client = db.getClientById(clientId);
        if (client && client.client_type === 'ghl' && !client.ghl_location_id) {
          // Verifica se essa location já não está vinculada a outro client
          const existingLink = db.getClientByGhlLocationId(locationId);
          if (existingLink) {
            console.warn(`[⚠️ GHL OAuth] Location ${locationId} já vinculada ao client "${existingLink.name}". Não vinculando novamente.`);
          } else {
            db.updateClient(clientId, { ghl_location_id: locationId });
            router.reload();
            linkedClientName = client.name;
            console.log(`[🔗 GHL OAuth] Location ${locationId} auto-vinculada ao client "${client.name}" (${clientId})`);
          }
        }
      }

      return new Response(GhlController.callbackSuccessHTML(locationId, companyId, linkedClientName), {
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

      console.log(`[📩 GHL Outbound] Recebido:`, JSON.stringify(body).substring(0, 500));

      // GHL Custom Provider envia type "SMS" ou "Email" (não "ProviderOutboundMessage")
      const validTypes = ['SMS', 'Email', 'ProviderOutboundMessage'];
      if (!validTypes.includes(body.type)) {
        console.log(`[ℹ️ GHL Outbound] Evento ignorado: ${body.type}`);
        return jsonResponse({ status: 'ignored', type: body.type });
      }

      const { locationId, contactId, messageId } = body;

      // GHL envia campos no top-level: "message" e "phone" (não content.text / endpoint.phone)
      const messageText = body.message || body.content?.text || '';
      const phoneNumber = body.phone || body.endpoint?.phone || '';
      const attachments: any[] = body.attachments || [];

      if (!locationId || !phoneNumber) {
        console.warn(`[⚠️ GHL Outbound] Payload incompleto:`, body);
        return jsonResponse({ error: 'Payload incompleto — locationId e phone são obrigatórios' }, 400);
      }

      // Precisa ter texto OU attachments
      if (!messageText && attachments.length === 0) {
        console.warn(`[⚠️ GHL Outbound] Sem conteúdo:`, body);
        return jsonResponse({ error: 'Payload sem conteúdo — message ou attachments são obrigatórios' }, 400);
      }

      // Busca o cliente vinculado a essa location
      const client = db.getClientByGhlLocationId(locationId);
      if (!client) {
        console.error(`[❌ GHL Outbound] Nenhum cliente vinculado à location ${locationId}`);
        return jsonResponse({ error: `Nenhum cliente configurado para location ${locationId}` }, 404);
      }

      // Normaliza o telefone (remove + e espaços)
      const to = phoneNumber.replace(/[^0-9]/g, '');

      console.log(`[📤 GHL → WhatsApp] Enviando de "${client.name}" (${client.phone_number_id}) para ${to}: "${(messageText || '[mídia]').substring(0, 50)}..." ${attachments.length > 0 ? `(+${attachments.length} attachment(s))` : ''}`);

      // Se tiver attachments, envia cada um como mídia separada
      if (attachments.length > 0) {
        for (const att of attachments) {
          const attUrl = att.url || att.link || '';
          if (!attUrl) continue;

          const mimeType = (att.contentType || att.type || '').toLowerCase();
          const caption = messageText || undefined; // Usa o texto como caption na primeira mídia

          let sendInput: any = { phone_number_id: client.phone_number_id, to };

          if (mimeType.startsWith('image/')) {
            sendInput.type = 'image';
            sendInput.image = { link: attUrl, caption };
          } else if (mimeType.startsWith('video/')) {
            sendInput.type = 'video';
            sendInput.video = { link: attUrl, caption };
          } else if (mimeType.startsWith('audio/')) {
            sendInput.type = 'audio';
            sendInput.audio = { link: attUrl };
          } else {
            // Trata como documento (PDF, DOCX, etc)
            sendInput.type = 'document';
            sendInput.document = { link: attUrl, caption, filename: att.name || att.filename || 'file' };
          }

          const attResult = await sender.send(sendInput);
          if (!attResult.success) {
            console.error(`[❌ GHL → WhatsApp] Erro ao enviar attachment:`, attResult.error);
          } else {
            console.log(`[📎 GHL → WhatsApp] Attachment enviado: ${mimeType}`);
          }
        }
      }

      // Envia mensagem de texto (se houver texto E não foi usado como caption)
      let result;
      if (messageText && attachments.length === 0) {
        result = await sender.send({
          phone_number_id: client.phone_number_id,
          to,
          type: 'text',
          text: { body: messageText },
        });
      } else if (messageText && attachments.length > 0) {
        // Texto já foi enviado como caption do attachment
        result = { success: true };
      } else {
        // Só attachment, sem texto
        result = { success: true };
      }

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

  private static callbackSuccessHTML(locationId: string, companyId: string, linkedClientName?: string | null): string {
    const linkedSection = linkedClientName
      ? `<div class="linked"><span>Cliente vinculado:</span> ${linkedClientName}</div>
         <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #22c55e;">Tudo pronto! O fluxo WhatsApp ↔ GHL está ativo.</p>`
      : `<p style="margin-top: 1.5rem; font-size: 0.85rem;">Vincule essa location a um cliente via <code>PUT /api/clients/:id</code> com <code>ghl_location_id</code>, ou use <code>/integrations/install?client_id=xxx</code> para vincular automaticamente.</p>`;

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
    .linked { background: #064e3b; border-radius: 8px; padding: 1rem; margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; text-align: left; color: #6ee7b7; }
    .linked span { color: #34d399; }
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
    ${linkedSection}
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
