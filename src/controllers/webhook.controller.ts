import { env } from '../config/env';
import { verifyMetaSignature } from '../middlewares/metaSecurity';
import { router } from '../services/router.service';
import { ghlApi } from '../services/ghl-api.service';

export class WebhookController {

  static verify(req: Request, url: URL): Response {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === env.META_VERIFY_TOKEN) {
      console.log("[🟢 Webhook] Desafio de verificação aceito.");
      return new Response(challenge, { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  static async handleMessage(req: Request): Promise<Response> {
    try {
      const rawBody = await req.text();
      const signatureHeader = req.headers.get('x-hub-signature-256');

      if (!verifyMetaSignature(rawBody, signatureHeader)) {
        console.warn("[🔴 Alerta de Segurança] Tentativa de injeção bloqueada!");
        return new Response("Unauthorized", { status: 401 });
      }

      const body = JSON.parse(rawBody);

      if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0]?.value;

        if (changes?.messages) {
          const phoneId = changes.metadata.phone_number_id;
          const displayPhone = changes.metadata.display_phone_number;
          const msg = changes.messages[0];
          const from = msg.from;
          const text = msg.text?.body || "Mídia/Interação recebida";
          const waMessageId = msg.id;
          const contactName = changes.contacts?.[0]?.profile?.name;

          // Resolve o destino via roteamento multi-tenant
          const destination = router.getDestination(phoneId);

          console.log(`[✅ Autenticado] Mensagem de ${from} no Bot ID: ${phoneId}`);
          console.log(`[💬 Conteúdo]: ${text}`);

          // ─── GHL Client: envia via GHL Conversations API ─────
          if (destination.clientType === 'ghl' && destination.ghlLocationId) {
            console.log(`[🔀 Roteamento]: GHL inbound para location ${destination.ghlLocationId} (${destination.clientName})`);

            this.handleGhlInbound({
              locationId: destination.ghlLocationId,
              phoneFrom: from,
              phoneTo: displayPhone || phoneId,
              message: text,
              messageId: waMessageId,
              contactName: contactName,
            }).catch(err => console.error(`[❌ GHL Inbound] Erro:`, err));

          // ─── Webhook Client: forward padrão (n8n, etc) ───────
          } else if (destination.webhookUrl) {
            console.log(`[🔀 Roteamento]: Webhook para "${destination.clientName}" → ${destination.webhookUrl}`);

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };

            if (destination.authToken) {
              headers['Authorization'] = `Bearer ${destination.authToken}`;
            }

            fetch(destination.webhookUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            }).catch(err => console.error(`[❌ Roteamento] Erro ao repassar para "${destination.clientName}":`, err));

          } else {
            console.warn(`[⚠️ Roteamento] Nenhum destino configurado para phone_number_id: ${phoneId}`);
          }
        }

        // Captura status updates (delivered, read, sent)
        if (changes?.statuses) {
          const status = changes.statuses[0];
          console.log(`[📊 Status] ${status.status} — msg ${status.id} para ${status.recipient_id}`);

          // Para clientes GHL, o status update já é feito no outbound handler (ghl.controller.ts)
          // usando o messageId correto do GHL. O webhook da Meta envia wamid (WhatsApp ID),
          // que não é reconhecido pelo GHL, então ignoramos aqui para evitar erros 401.
          const phoneId = changes.metadata?.phone_number_id;
          if (phoneId) {
            const destination = router.getDestination(phoneId);
            if (destination.clientType === 'ghl' && destination.ghlLocationId) {
              console.log(`[📊 GHL Status] Ignorando status "${status.status}" via Meta webhook (wamid não mapeado para GHL messageId)`);
            }
          }
        }
      }

      // Sempre retorna 200 imediatamente para não bloquear o webhook da Meta
      return new Response("EVENT_RECEIVED", { status: 200 });

    } catch (error) {
      console.error("[Erro Fatal no Processamento]", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  /**
   * Processa uma mensagem inbound para GHL:
   * 1. Busca/cria o contato no GHL pela phone
   * 2. Envia a mensagem inbound via GHL Conversations API
   */
  private static async handleGhlInbound(params: {
    locationId: string;
    phoneFrom: string;
    phoneTo: string;
    message: string;
    messageId?: string;
    contactName?: string;
  }): Promise<void> {
    const { locationId, phoneFrom, phoneTo, message, messageId, contactName } = params;

    // 1. Busca ou cria contato no GHL
    const contactId = await ghlApi.findOrCreateContact({
      locationId,
      phoneNumber: phoneFrom,
      name: contactName,
    });

    // 2. Envia mensagem inbound para o GHL
    await ghlApi.addInboundMessage({
      locationId,
      contactId,
      message,
      phoneFrom,
      phoneTo,
      messageId,
    });

    console.log(`[📥 GHL Inbound] Mensagem de ${phoneFrom} enviada para GHL (contact: ${contactId})`);
  }
}
