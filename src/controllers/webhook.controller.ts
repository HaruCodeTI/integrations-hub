import { env } from '../config/env';
import { verifyMetaSignature } from '../middlewares/metaSecurity';
import { router } from '../services/router.service';

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
          const from = changes.messages[0].from;
          const text = changes.messages[0].text?.body || "Mídia/Interação recebida";

          // Resolve o destino via roteamento multi-tenant
          const destination = router.getDestination(phoneId);

          console.log(`[✅ Autenticado] Mensagem de ${from} no Bot ID: ${phoneId}`);
          console.log(`[💬 Conteúdo]: ${text}`);
          console.log(`[🔀 Roteamento]: Encaminhando para "${destination.clientName}" → ${destination.webhookUrl}`);

          if (destination.webhookUrl) {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };

            // Se o destino tem auth_token, envia como Bearer
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
        }
      }

      // Sempre retorna 200 imediatamente para não bloquear o webhook da Meta
      return new Response("EVENT_RECEIVED", { status: 200 });

    } catch (error) {
      console.error("[Erro Fatal no Processamento]", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}
