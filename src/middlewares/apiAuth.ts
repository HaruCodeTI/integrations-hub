import { env } from '../config/env';

/**
 * Valida o header Authorization: Bearer <GATEWAY_API_KEY>
 * para proteger as rotas /api/*
 */
export function validateApiKey(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.split('Bearer ')[1];
  return token === env.GATEWAY_API_KEY;
}

/**
 * Retorna uma Response 401 padronizada
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized', message: 'API key inválida ou ausente. Use: Authorization: Bearer <GATEWAY_API_KEY>' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
