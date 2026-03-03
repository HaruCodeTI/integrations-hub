import { env } from '../config/env';
import { verifyMetaSignature } from '../middlewares/metaSecurity';

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
      const payload = await req.json();
      const signatureHeader = req.headers.get('x-hub-signature-256');
      console.log(`[💬 Conteúdo_payload]: ${payload}`);

      if (!verifyMetaSignature(rawBody, signatureHeader)) {
        console.warn("[🔴 Alerta de Segurança] Tentativa de injeção no Webhook bloqueada!");
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

          console.log(`[✅ Autenticado] Mensagem de ${from} no Bot ID: ${phoneId}`);
          console.log(`[💬 Conteúdo]: ${text}`);
          
          if (payload.entry?.[0]?.changes?.[0]?.value?.messages) {
            const message = changes.messages[0];
            console.log(`[💬 Conteúdo_teste]: ${message.text?.body}`);
          
            fetch(env.WEBHOOK_URL_N8N, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(req.body)
            }).catch(err => console.error("Erro ao repassar para n8n:", err));
          }
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });

    } catch (error) {
      console.error("[Erro Fatal no Processamento]", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
}