// src/modules/accounts/accounts.routes.ts
import { AccountsController } from './accounts.controller';

export async function accountsRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {
  if (pathname === '/api/v2/accounts') {
    if (method === 'GET') return AccountsController.list();
    if (method === 'POST') return AccountsController.create(req);
  }

  const idMatch = pathname.match(/^\/api\/v2\/accounts\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'PATCH') return AccountsController.update(req, id);
    if (method === 'DELETE') return AccountsController.delete(id);
  }

  return null;
}
