// src/modules/templates/templates.routes.ts
import { TemplatesController } from './templates.controller';

export async function templatesRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {

  // GET /api/v2/templates/:phone_number_id
  // POST /api/v2/templates/:phone_number_id
  const listMatch = pathname.match(/^\/api\/v2\/templates\/([^/]+)$/);
  if (listMatch) {
    if (method === 'GET') return TemplatesController.listTemplates(listMatch[1]);
    if (method === 'POST') return TemplatesController.createTemplate(req, listMatch[1]);
  }

  // DELETE /api/v2/templates/:phone_number_id/:name
  const nameMatch = pathname.match(/^\/api\/v2\/templates\/([^/]+)\/([^/]+)$/);
  if (nameMatch) {
    if (method === 'DELETE') return TemplatesController.deleteTemplate(nameMatch[1], decodeURIComponent(nameMatch[2]));
  }

  return null;
}
