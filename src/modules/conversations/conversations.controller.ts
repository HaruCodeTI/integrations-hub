// src/modules/conversations/conversations.controller.ts
import { ConversationsService } from './conversations.service';
import { db } from '../../services/db.service';

export class ConversationsController {

  static listConversations(phone_number_id: string): Response {
    const convs = ConversationsService.listConversations(phone_number_id);
    return Response.json(convs);
  }

  static getMessages(phone_number_id: string, contact_phone: string): Response {
    const msgs = ConversationsService.getMessages(phone_number_id, contact_phone);
    return Response.json(msgs);
  }

  static async sendMessage(req: Request, phone_number_id: string, contact_phone: string): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body?.message || typeof body.message !== 'string') {
      return Response.json({ error: 'Campo message obrigatorio' }, { status: 400 });
    }

    const client = db.getClientByPhoneId(phone_number_id);
    if (!client) {
      return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    }

    try {
      const result = await ConversationsService.sendMessage({
        phone_number_id,
        contact_phone,
        message: body.message,
      });
      return Response.json(result);
    } catch (err: any) {
      return Response.json({ error: err.message ?? 'Erro ao enviar mensagem' }, { status: 500 });
    }
  }
}
