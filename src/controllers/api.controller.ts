import { db, type CreateClientInput, type UpdateClientInput } from '../services/db.service';
import { router } from '../services/router.service';
import { sender, type SendMessageInput } from '../services/sender.service';

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export class ApiController {

  // ─── CRUD de Clientes ──────────────────────────────────────

  /** GET /api/clients */
  static listClients(): Response {
    const clients = db.getAllClients();
    return jsonResponse({ count: clients.length, clients });
  }

  /** POST /api/clients */
  static async createClient(req: Request): Promise<Response> {
    try {
      const body = await req.json() as CreateClientInput;

      // Validações
      if (!body.name || !body.phone_number_id || !body.webhook_url || !body.meta_token) {
        return jsonResponse({
          error: 'Campos obrigatórios: name, phone_number_id, webhook_url, meta_token',
        }, 400);
      }

      // Verifica duplicidade
      const existing = db.getClientByPhoneId(body.phone_number_id);
      if (existing) {
        return jsonResponse({
          error: `Já existe um cliente com phone_number_id: ${body.phone_number_id} (${existing.name})`,
        }, 409);
      }

      const client = db.createClient(body);
      router.reload(); // Atualiza o cache

      console.log(`[➕ API] Cliente criado: "${client.name}" (${client.phone_number_id})`);
      return jsonResponse({ message: 'Cliente criado com sucesso', client }, 201);

    } catch (error: any) {
      return jsonResponse({ error: 'Body inválido', details: error.message }, 400);
    }
  }

  /** PUT /api/clients/:id */
  static async updateClient(req: Request, id: string): Promise<Response> {
    try {
      const body = await req.json() as UpdateClientInput;

      const updated = db.updateClient(id, body);
      if (!updated) {
        return jsonResponse({ error: 'Cliente não encontrado' }, 404);
      }

      router.reload(); // Atualiza o cache

      console.log(`[✏️  API] Cliente atualizado: "${updated.name}" (${updated.phone_number_id})`);
      return jsonResponse({ message: 'Cliente atualizado', client: updated });

    } catch (error: any) {
      return jsonResponse({ error: 'Body inválido', details: error.message }, 400);
    }
  }

  /** DELETE /api/clients/:id (soft delete) */
  static deleteClient(id: string): Response {
    const client = db.getClientById(id);
    if (!client) {
      return jsonResponse({ error: 'Cliente não encontrado' }, 404);
    }

    db.deleteClient(id);
    router.reload(); // Atualiza o cache

    console.log(`[🗑️  API] Cliente desativado: "${client.name}" (${client.phone_number_id})`);
    return jsonResponse({ message: `Cliente "${client.name}" desativado com sucesso` });
  }

  // ─── Envio de Mensagens ────────────────────────────────────

  /** POST /api/send */
  static async sendMessage(req: Request): Promise<Response> {
    try {
      const body = await req.json() as SendMessageInput;

      // Validações básicas
      if (!body.phone_number_id || !body.to) {
        return jsonResponse({
          error: 'Campos obrigatórios: phone_number_id, to',
        }, 400);
      }

      // Validação: precisa ter pelo menos um tipo de conteúdo
      if (!body.text && !body.template && !body.image && !body.document && !body.audio && !body.video) {
        return jsonResponse({
          error: 'Envie pelo menos um conteúdo: text, template, image, document, audio ou video',
        }, 400);
      }

      const result = await sender.send(body);

      if (result.success) {
        return jsonResponse({ message: 'Mensagem enviada com sucesso', data: result.data });
      } else {
        return jsonResponse({ error: result.error, data: result.data }, 422);
      }

    } catch (error: any) {
      return jsonResponse({ error: 'Body inválido', details: error.message }, 400);
    }
  }
}
