// src/modules/conversations/conversations.service.ts
import { db, ConversationSummary, Message } from '../../services/db.service';
import { sender } from '../../services/sender.service';

export class ConversationsService {

  static listConversations(phone_number_id: string): ConversationSummary[] {
    return db.listConversations(phone_number_id);
  }

  static getMessages(phone_number_id: string, contact_phone: string): Message[] {
    return db.getMessages(phone_number_id, contact_phone);
  }

  static async sendMessage(params: {
    phone_number_id: string;
    contact_phone: string;
    message?: string;
    type?: 'text' | 'image' | 'audio' | 'video' | 'document';
    media_id?: string;
    caption?: string;
    filename?: string;
  }): Promise<{ wamid: string }> {
    const { phone_number_id, contact_phone, message, type = 'text', media_id, caption, filename } = params;

    let sendInput: Parameters<typeof sender.send>[0];
    if (type === 'text') {
      sendInput = { phone_number_id, to: contact_phone, type: 'text', text: { body: message! } };
    } else if (type === 'image') {
      sendInput = { phone_number_id, to: contact_phone, type: 'image', image: { id: media_id!, caption } };
    } else if (type === 'audio') {
      sendInput = { phone_number_id, to: contact_phone, type: 'audio', audio: { id: media_id! } };
    } else if (type === 'video') {
      sendInput = { phone_number_id, to: contact_phone, type: 'video', video: { id: media_id!, caption } };
    } else if (type === 'document') {
      sendInput = { phone_number_id, to: contact_phone, type: 'document', document: { id: media_id!, caption, filename } };
    } else {
      throw new Error(`Tipo nao suportado: ${type}`);
    }

    const result = await sender.send(sendInput);

    if (!result.success || !result.data?.messages?.[0]?.id) {
      throw new Error(result.error ?? 'Falha ao enviar mensagem via Meta API');
    }

    const wamid = result.data.messages[0].id as string;

    // content espelha o payload enviado — inclui 'type' para compatibilidade com renderBody no frontend
    const content = type === 'text'
      ? { type: 'text', text: { body: message } }
      : { type, [type]: { id: media_id, ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) } };

    db.saveMessage({
      id: wamid,
      phone_number_id,
      contact_phone,
      direction: 'outbound',
      type,
      content,
    });

    return { wamid };
  }
}
