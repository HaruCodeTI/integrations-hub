// src/modules/conversations/conversations.routes.ts
import { ConversationsController } from './conversations.controller';

// Retorna Response se a rota bate, null caso contrario
export async function conversationsRoutes(req: Request, method: string, pathname: string): Promise<Response | null> {

  // GET /api/v2/conversations/:phone_number_id
  const listMatch = pathname.match(/^\/api\/v2\/conversations\/([^/]+)$/);
  if (method === 'GET' && listMatch) {
    return ConversationsController.listConversations(listMatch[1]);
  }

  // GET /api/v2/conversations/:phone_number_id/:contact
  const msgMatch = pathname.match(/^\/api\/v2\/conversations\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && msgMatch) {
    return ConversationsController.getMessages(msgMatch[1], decodeURIComponent(msgMatch[2]));
  }

  // POST /api/v2/conversations/:phone_number_id/:contact
  if (method === 'POST' && msgMatch) {
    return ConversationsController.sendMessage(req, msgMatch[1], decodeURIComponent(msgMatch[2]));
  }

  return null;
}
