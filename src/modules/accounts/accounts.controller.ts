// src/modules/accounts/accounts.controller.ts
import { AccountsService } from './accounts.service';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export class AccountsController {
  static list(): Response {
    const accounts = AccountsService.list();
    return json(accounts);
  }

  static async create(req: Request): Promise<Response> {
    const body = await req.json() as any;
    if (!body.name || !body.phone_number_id || !body.meta_token) {
      return json({ error: 'name, phone_number_id e meta_token são obrigatórios' }, 400);
    }
    const { name, phone_number_id, meta_token, webhook_url = '' } = body;
    try {
      const account = AccountsService.create({ name, phone_number_id, meta_token, webhook_url });
      return json(account, 201);
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  static async update(req: Request, id: string): Promise<Response> {
    const body = await req.json() as any;
    // Only allow name and active to be updated via panel
    const { name, active } = body as { name?: string; active?: number };
    const input: Record<string, unknown> = {};
    if (name !== undefined) input.name = name;
    if (active !== undefined) input.active = active;
    if (Object.keys(input).length === 0) {
      return json({ error: 'Nenhum campo para atualizar' }, 400);
    }
    const account = AccountsService.update(id, input as any);
    if (!account) return json({ error: 'Conta não encontrada' }, 404);
    return json(account);
  }

  static delete(id: string): Response {
    const ok = AccountsService.delete(id);
    if (!ok) return json({ error: 'Conta não encontrada' }, 404);
    return json({ ok: true });
  }
}
