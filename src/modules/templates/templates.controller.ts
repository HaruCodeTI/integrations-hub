// src/modules/templates/templates.controller.ts
import { TemplatesService } from './templates.service';
import { db } from '../../services/db.service';

function getClient(phone_number_id: string): { meta_token: string } | null {
  return db.getClientByPhoneId(phone_number_id);
}

export class TemplatesController {

  static async listTemplates(phone_number_id: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    try {
      const templates = await TemplatesService.listTemplates(phone_number_id, client.meta_token);
      return Response.json(templates);
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  static async createTemplate(req: Request, phone_number_id: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body?.name || !body?.category || !body?.language || !body?.components) {
      return Response.json({ error: 'Campos obrigatorios: name, category, language, components' }, { status: 400 });
    }
    try {
      const result = await TemplatesService.createTemplate(phone_number_id, client.meta_token, body);
      return Response.json(result, { status: 201 });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  static async deleteTemplate(phone_number_id: string, name: string): Promise<Response> {
    const client = getClient(phone_number_id);
    if (!client) return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
    try {
      await TemplatesService.deleteTemplate(phone_number_id, client.meta_token, name);
      return Response.json({ ok: true });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }
}
