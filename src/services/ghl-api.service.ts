import { env } from '../config/env';
import { db } from './db.service';
import { ghlOAuth } from './ghl-oauth.service';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

/**
 * GhlApiService — Client para a API do GoHighLevel
 *
 * Responsável por:
 * 1. Enviar mensagens inbound (WhatsApp → GHL Conversations)
 * 2. Atualizar status de mensagens (sent, delivered, read)
 * 3. Buscar/criar contatos
 */
class GhlApiService {

  /**
   * Envia uma mensagem inbound para o GHL (aparece na aba Conversations).
   * Chamado quando uma mensagem do WhatsApp chega e o cliente está configurado como tipo GHL.
   */
  async addInboundMessage(params: {
    locationId: string;
    contactId: string;
    message: string;
    phoneFrom: string;
    phoneTo: string;
    messageId?: string;
    attachments?: Array<{ type: string; url: string; name: string }>;
  }): Promise<any> {
    const token = await ghlOAuth.getValidToken(params.locationId);

    // Formato da API v2 do GHL para Custom Conversation Provider
    // Campos top-level: type, contactId, conversationProviderId, message, phone, attachments
    const body: Record<string, any> = {
      type: 'Custom',
      contactId: params.contactId,
      conversationProviderId: env.GHL_CONVERSATION_PROVIDER_ID,
      message: params.message,
      phone: params.phoneFrom,
    };

    // altId permite rastrear a mensagem original do WhatsApp
    if (params.messageId) {
      body.altId = params.messageId;
    }

    // Attachments (mídia do WhatsApp)
    if (params.attachments && params.attachments.length > 0) {
      body.attachments = params.attachments;
    }

    console.log(`[📥 GHL API] Enviando inbound body:`, JSON.stringify(body).substring(0, 400));

    const response = await fetch(`${GHL_API_BASE}/conversations/messages/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Version': '2021-04-15',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error(`[❌ GHL API] Erro ao enviar inbound message:`, data);
      throw new Error(`GHL inbound message failed: ${response.status} — ${JSON.stringify(data)}`);
    }

    console.log(`[📥 GHL] Mensagem inbound enviada para contact ${params.contactId} na location ${params.locationId}`, JSON.stringify(data).substring(0, 200));
    return data;
  }

  /**
   * Atualiza o status de uma mensagem no GHL (sent, delivered, read, failed).
   */
  async updateMessageStatus(params: {
    locationId: string;
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    error?: string;
  }): Promise<any> {
    const token = await ghlOAuth.getValidToken(params.locationId);

    const body: any = {
      status: params.status,
    };

    if (params.error) {
      body.error = params.error;
    }

    const response = await fetch(`${GHL_API_BASE}/conversations/messages/${params.messageId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Version': '2021-04-15',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error(`[❌ GHL API] Erro ao atualizar status:`, data);
      return data;
    }

    console.log(`[📊 GHL] Status atualizado: ${params.messageId} → ${params.status}`);
    return data;
  }

  /**
   * Busca um contato no GHL pelo número de telefone.
   * Se não existir, cria um novo.
   */
  async findOrCreateContact(params: {
    locationId: string;
    phoneNumber: string;
    name?: string;
  }): Promise<string> {
    // Primeiro verifica o cache local
    const cached = db.getGhlContact(params.locationId, params.phoneNumber);
    if (cached) return cached.contact_id;

    const token = await ghlOAuth.getValidToken(params.locationId);

    // Busca pelo telefone
    const searchResponse = await fetch(
      `${GHL_API_BASE}/contacts/search/duplicate?locationId=${params.locationId}&number=${params.phoneNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    );

    const searchData = await searchResponse.json() as any;

    if (searchData.contact?.id) {
      const contactId = searchData.contact.id;
      db.upsertGhlContact(params.locationId, contactId, params.phoneNumber);
      console.log(`[🔍 GHL] Contato encontrado: ${contactId} (${params.phoneNumber})`);
      return contactId;
    }

    // Não encontrou — cria novo contato
    const createResponse = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Version': '2021-07-28',
      },
      body: JSON.stringify({
        locationId: params.locationId,
        phone: params.phoneNumber,
        name: params.name || `WhatsApp ${params.phoneNumber}`,
        source: 'wa-omni-gateway',
      }),
    });

    const createData = await createResponse.json() as any;

    if (createData.contact?.id) {
      const contactId = createData.contact.id;
      db.upsertGhlContact(params.locationId, contactId, params.phoneNumber);
      console.log(`[➕ GHL] Contato criado: ${contactId} (${params.phoneNumber})`);
      return contactId;
    }

    throw new Error(`Não foi possível encontrar/criar contato no GHL: ${JSON.stringify(createData)}`);
  }
}

export const ghlApi = new GhlApiService();
