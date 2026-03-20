import { env } from '../config/env';
import { verifyMetaSignature } from '../middlewares/metaSecurity';
import { router } from '../services/router.service';
import { ghlApi } from '../services/ghl-api.service';
import { mediaService } from '../services/media.service';
import { db } from '../services/db.service';
import { recordWebhookReceived } from '../modules/health/health.service';

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
    recordWebhookReceived();
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
          const waMessageId = msg.id;
          const contactName = changes.contacts?.[0]?.profile?.name;

          // Extrai mídia se existir
          const mediaInfo = mediaService.extractMediaFromMessage(msg);
          const text = msg.text?.body || mediaInfo?.caption || '';
          const msgType = msg.type || 'text';

          // Salva no inbox para todos os clientes (antes de rotear)
          try {
            db.saveMessage({
              id: waMessageId,
              phone_number_id: phoneId,
              contact_phone: from,
              direction: 'inbound',
              type: msgType,
              content: msg,
            });
          } catch (saveErr) {
            console.error('[webhook] Erro ao salvar mensagem no inbox:', saveErr);
          }

          // Resolve o destino via roteamento multi-tenant
          const destination = router.getDestination(phoneId);

          console.log(`[✅ Autenticado] Mensagem de ${from} no Bot ID: ${phoneId} (tipo: ${msgType})`);
          console.log(`[💬 Conteúdo]: ${text || `[${msgType}]`}`);

          // ─── GHL Client: envia via GHL Conversations API ─────
          if (destination.clientType === 'ghl' && destination.ghlLocationId) {
            console.log(`[🔀 Roteamento]: GHL inbound para location ${destination.ghlLocationId} (${destination.clientName})`);

            this.handleGhlInbound({
              locationId: destination.ghlLocationId,
              phoneFrom: from,
              phoneTo: displayPhone || phoneId,
              phoneNumberId: phoneId,
              message: text,
              messageId: waMessageId,
              contactName: contactName,
              mediaInfo: mediaInfo || undefined,
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
          const wamid = status.id;
          const statusName = status.status; // sent, delivered, read, failed
          console.log(`[📊 Status] ${statusName} — msg ${wamid} para ${status.recipient_id}`);

          // Atualiza status no inbox e em campanhas (todos os clientes)
          try {
            db.updateMessageStatus(wamid, statusName);
            if (statusName === 'delivered' || statusName === 'read' || statusName === 'failed') {
              db.updateCampaignContactByWamid(
                wamid,
                statusName as 'delivered' | 'read' | 'failed',
                status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : undefined,
                status.errors?.[0]?.code?.toString(),
                status.errors?.[0]?.title
              );
            }
          } catch (statusErr) {
            console.error('[webhook] Erro ao atualizar status no inbox/campanhas:', statusErr);
          }

          // Para clientes GHL, busca o mapeamento wamid → GHL messageId
          const phoneId = changes.metadata?.phone_number_id;
          if (phoneId) {
            const destination = router.getDestination(phoneId);
            if (destination.clientType === 'ghl' && destination.ghlLocationId) {
              const mapping = db.getMessageMapping(wamid);
              if (mapping) {
                // Mapeia status da Meta para status do GHL
                const ghlStatus = statusName === 'read' ? 'read'
                  : statusName === 'delivered' ? 'delivered'
                  : statusName === 'sent' ? 'sent'
                  : statusName === 'failed' ? 'failed'
                  : null;

                if (ghlStatus) {
                  ghlApi.updateMessageStatus({
                    locationId: mapping.location_id,
                    messageId: mapping.ghl_message_id,
                    status: ghlStatus as any,
                    error: statusName === 'failed' ? (status.errors?.[0]?.title || 'Delivery failed') : undefined,
                  }).then(() => {
                    console.log(`[📊 GHL Status] ${mapping.ghl_message_id} → ${ghlStatus}`);
                  }).catch((err) => {
                    console.warn(`[⚠️ GHL Status] Erro ao atualizar ${mapping.ghl_message_id} → ${ghlStatus}:`, err);
                  });
                }
              } else {
                console.log(`[📊 GHL Status] Sem mapeamento para wamid ${wamid} (status: ${statusName})`);
              }
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
   * 2. Se tiver mídia, baixa e prepara o attachment
   * 3. Envia a mensagem inbound via GHL Conversations API
   */
  private static async handleGhlInbound(params: {
    locationId: string;
    phoneFrom: string;
    phoneTo: string;
    phoneNumberId: string;
    message: string;
    messageId?: string;
    contactName?: string;
    mediaInfo?: {
      mediaId: string;
      mimeType: string;
      caption?: string;
      filename?: string;
      type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    };
  }): Promise<void> {
    const { locationId, phoneFrom, phoneTo, phoneNumberId, message, messageId, contactName, mediaInfo } = params;

    // 1. Busca ou cria contato no GHL
    const contactId = await ghlApi.findOrCreateContact({
      locationId,
      phoneNumber: phoneFrom,
      name: contactName,
    });

    // 2. Se tiver mídia, pré-baixa no cache e gera URL de proxy pública
    let attachments: string[] | undefined;
    if (mediaInfo) {
      try {
        console.log(`[📎 Mídia] Baixando ${mediaInfo.type} (${mediaInfo.mediaId}) de ${phoneFrom}...`);

        // Pré-baixa no cache para que o proxy sirva instantaneamente
        const downloaded = await mediaService.downloadAndCache(mediaInfo.mediaId, phoneNumberId);

        // Gera URL pública de proxy protegida por HMAC (com extensão para preview no GHL)
        const proxyUrl = mediaService.getProxyUrl(mediaInfo.mediaId, phoneNumberId, downloaded.mimeType);

        // GHL espera attachments como array de strings URL
        attachments = [proxyUrl];

        console.log(`[📎 Mídia] ${mediaInfo.type} cacheado: ${(downloaded.fileSize / 1024).toFixed(1)}KB → ${proxyUrl}`);
      } catch (err) {
        console.error(`[❌ Mídia] Erro ao baixar ${mediaInfo.type}:`, err);
        // Se falhar o download, envia sem attachment mas com indicação no texto
        if (!message) {
          params.message = `[${mediaInfo.type} não disponível]`;
        }
      }
    }

    // 3. Envia mensagem inbound para o GHL
    await ghlApi.addInboundMessage({
      locationId,
      contactId,
      message: message || (mediaInfo ? `[${mediaInfo.type}]` : ''),
      phoneFrom,
      phoneTo,
      messageId,
      attachments,
    });

    console.log(`[📥 GHL Inbound] Mensagem de ${phoneFrom} enviada para GHL (contact: ${contactId}${attachments ? `, com ${attachments.length} attachment(s)` : ''})`);
  }
}
