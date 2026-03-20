import { db } from './db.service';

const META_API_BASE = 'https://graph.facebook.com/v25.0';

export interface SendMessageInput {
  phone_number_id: string;
  to: string;
  type?: 'text' | 'template' | 'image' | 'document' | 'audio' | 'video';
  text?: { body: string };
  template?: { name: string; language: { code: string }; components?: any[] };
  image?: { link?: string; id?: string; caption?: string };
  document?: { link?: string; id?: string; caption?: string; filename?: string };
  audio?: { link?: string; id?: string };
  video?: { link?: string; id?: string; caption?: string };
}

export interface SendResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * SenderService — Envio centralizado de mensagens via Meta API
 *
 * O bot/n8n chama POST /api/send e o gateway resolve o meta_token
 * do cliente dono do phone_number_id, montando o request para a Meta.
 */
class SenderService {

  async send(input: SendMessageInput): Promise<SendResult> {
    const { phone_number_id, to, type = 'text', ...rest } = input;

    // Busca o meta_token do cliente no banco
    const client = db.getClientByPhoneId(phone_number_id);
    if (!client) {
      return { success: false, error: `Cliente não encontrado para phone_number_id: ${phone_number_id}` };
    }

    if (!client.meta_token) {
      return { success: false, error: `Cliente "${client.name}" não possui meta_token configurado.` };
    }

    // Monta o body conforme o tipo
    const body: any = {
      messaging_product: 'whatsapp',
      to,
      type,
    };

    // Adiciona o campo específico do tipo
    if (type === 'text' && rest.text) {
      body.text = rest.text;
    } else if (type === 'template' && rest.template) {
      body.template = rest.template;
    } else if (type === 'image' && rest.image) {
      body.image = rest.image;
    } else if (type === 'document' && rest.document) {
      body.document = rest.document;
    } else if (type === 'audio' && rest.audio) {
      body.audio = rest.audio;
    } else if (type === 'video' && rest.video) {
      body.video = rest.video;
    }

    try {
      const url = `${META_API_BASE}/${phone_number_id}/messages`;
      console.log(`[Sender] POST ${url}`, JSON.stringify(body));
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${client.meta_token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error(`[❌ Sender] Erro ao enviar para ${to} via ${client.name}:`, data);
        return { success: false, error: data.error?.message || 'Erro desconhecido da Meta API', data };
      }

      console.log(`[📤 Sender] Mensagem enviada para ${to} via "${client.name}" (${phone_number_id})`);
      return { success: true, data };

    } catch (error: any) {
      console.error(`[❌ Sender] Exceção ao enviar:`, error);
      return { success: false, error: error.message };
    }
  }
}

export const sender = new SenderService();
