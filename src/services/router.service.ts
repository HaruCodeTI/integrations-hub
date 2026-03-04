import { db, type Client } from './db.service';
import { env } from '../config/env';

/**
 * RouterService — Cache em memória + resolução de rotas
 *
 * Mantém um Map em memória para lookup O(1) por phone_number_id.
 * Recarrega do SQLite quando necessário.
 */
class RouterService {
  private cache: Map<string, Client> = new Map();

  constructor() {
    this.reload();
  }

  /** Recarrega todos os clientes ativos do banco para o cache */
  reload() {
    this.cache.clear();
    const clients = db.getActiveClients();
    for (const client of clients) {
      this.cache.set(client.phone_number_id, client);
    }
    console.log(`[🔄 Router] Cache recarregado: ${this.cache.size} cliente(s) ativo(s).`);
  }

  /** Invalida o cache de um cliente específico */
  invalidate(phoneNumberId: string) {
    this.cache.delete(phoneNumberId);
  }

  /**
   * Resolve a rota para um phone_number_id.
   * Retorna o cliente dono desse número ou null.
   *
   * Fluxo:
   * 1. Busca no cache (memória)
   * 2. Se não encontrou, busca no banco (SQLite)
   * 3. Se encontrou no banco, atualiza o cache
   * 4. Se não encontrou em lugar nenhum, retorna null
   */
  resolve(phoneNumberId: string): Client | null {
    // 1. Busca no cache
    const cached = this.cache.get(phoneNumberId);
    if (cached) return cached;

    // 2. Fallback para o banco
    const fromDb = db.getClientByPhoneId(phoneNumberId);
    if (fromDb) {
      this.cache.set(phoneNumberId, fromDb);
      return fromDb;
    }

    return null;
  }

  /**
   * Retorna a URL de destino para um phone_number_id.
   * Se não encontrar no banco, usa o fallback legado (WEBHOOK_URL_N8N).
   */
  getDestination(phoneNumberId: string): { webhookUrl: string; authToken: string | null; metaToken: string | null; clientName: string } {
    const client = this.resolve(phoneNumberId);

    if (client) {
      return {
        webhookUrl: client.webhook_url,
        authToken: client.auth_token,
        metaToken: client.meta_token,
        clientName: client.name,
      };
    }

    // Fallback legado — encaminha para o n8n configurado no .env
    if (env.WEBHOOK_URL_N8N) {
      return {
        webhookUrl: env.WEBHOOK_URL_N8N,
        authToken: null,
        metaToken: null,
        clientName: 'Legado (N8N fallback)',
      };
    }

    return {
      webhookUrl: '',
      authToken: null,
      metaToken: null,
      clientName: 'SEM DESTINO',
    };
  }
}

export const router = new RouterService();
