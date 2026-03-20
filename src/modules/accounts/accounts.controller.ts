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
    try {
      const account = AccountsService.create(body);
      return json(account, 201);
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  static async update(req: Request, id: string): Promise<Response> {
    const body = await req.json() as any;
    const account = AccountsService.update(id, body);
    if (!account) return json({ error: 'Conta não encontrada' }, 404);
    return json(account);
  }

  static delete(id: string): Response {
    const ok = AccountsService.delete(id);
    if (!ok) return json({ error: 'Conta não encontrada' }, 404);
    return json({ ok: true });
  }
}
