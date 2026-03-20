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
    message: string;
  }): Promise<{ wamid: string }> {
    // sender.send() busca meta_token do DB automaticamente via phone_number_id
    const result = await sender.send({
      phone_number_id: params.phone_number_id,
      to: params.contact_phone,
      type: 'text',
      text: { body: params.message },
    });

    if (!result.success || !result.data?.messages?.[0]?.id) {
      throw new Error(result.error ?? 'Falha ao enviar mensagem via Meta API');
    }

    const wamid = result.data.messages[0].id as string;

    // Salva a mensagem outbound no inbox
    db.saveMessage({
      id: wamid,
      phone_number_id: params.phone_number_id,
      contact_phone: params.contact_phone,
      direction: 'outbound',
      type: 'text',
      content: { text: { body: params.message } },
    });

    return { wamid };
  }
}
