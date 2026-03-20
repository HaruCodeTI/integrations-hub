// src/modules/templates/templates.service.ts

import { db } from '../../services/db.service';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export interface MetaTemplate {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: object[];
}

export interface CreateTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: object[];
}

async function graphRequest(url: string, token: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json() as any;
  if (data.error) {
    const e = data.error;
    const detail = e.error_data ? ` | data: ${JSON.stringify(e.error_data)}` : '';
    const subcode = e.error_subcode ? ` | subcode: ${e.error_subcode}` : '';
    console.error('[Meta API error]', JSON.stringify(data.error));
    throw new Error(`${e.message ?? 'Erro na Meta API'} (code ${e.code}${subcode}${detail})`);
  }
  return data;
}

export class TemplatesService {

  static async getWabaId(phone_number_id: string, token: string): Promise<string> {
    // Usa waba_id armazenado no cliente se disponível (System User tokens não conseguem
    // traversar phone_number_id → whatsapp_business_account via API)
    const client = db.getClientByPhoneId(phone_number_id);
    if (client?.waba_id) return client.waba_id;

    const data = await graphRequest(
      `${GRAPH_URL}/${phone_number_id}?fields=whatsapp_business_account`,
      token
    );
    const wabaId = data.whatsapp_business_account?.id;
    if (!wabaId) throw new Error('WABA ID nao encontrado. Configure o waba_id no cliente.');
    return wabaId;
  }

  static async listTemplates(phone_number_id: string, token: string): Promise<MetaTemplate[]> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    const data = await graphRequest(
      `${GRAPH_URL}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`,
      token
    );
    return data.data ?? [];
  }

  static async createTemplate(
    phone_number_id: string,
    token: string,
    input: CreateTemplateInput
  ): Promise<{ id: string }> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    console.log('[createTemplate] payload:', JSON.stringify(input, null, 2));
    const data = await graphRequest(`${GRAPH_URL}/${wabaId}/message_templates`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { id: data.id };
  }

  static async deleteTemplate(
    phone_number_id: string,
    token: string,
    name: string
  ): Promise<void> {
    const wabaId = await TemplatesService.getWabaId(phone_number_id, token);
    await graphRequest(
      `${GRAPH_URL}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      token,
      { method: 'DELETE' }
    );
  }
}
