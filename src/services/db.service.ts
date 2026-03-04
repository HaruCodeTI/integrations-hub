import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

export interface Client {
  id: string;
  name: string;
  phone_number_id: string;
  webhook_url: string;
  auth_token: string | null;
  meta_token: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export type CreateClientInput = {
  name: string;
  phone_number_id: string;
  webhook_url: string;
  auth_token?: string;
  meta_token: string;
};

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'phone_number_id'>> & {
  phone_number_id?: string;
  active?: number;
};

class DatabaseService {
  private db: Database;

  constructor() {
    this.db = new Database('gateway.db');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone_number_id TEXT UNIQUE NOT NULL,
        webhook_url TEXT NOT NULL,
        auth_token TEXT,
        meta_token TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    console.log('[🗄️  DB] SQLite inicializado com sucesso.');
  }

  getAllClients(): Client[] {
    return this.db.query('SELECT * FROM clients ORDER BY created_at DESC').all() as Client[];
  }

  getActiveClients(): Client[] {
    return this.db.query('SELECT * FROM clients WHERE active = 1').all() as Client[];
  }

  getClientById(id: string): Client | null {
    return this.db.query('SELECT * FROM clients WHERE id = ?').get(id) as Client | null;
  }

  getClientByPhoneId(phoneNumberId: string): Client | null {
    return this.db.query('SELECT * FROM clients WHERE phone_number_id = ? AND active = 1').get(phoneNumberId) as Client | null;
  }

  createClient(input: CreateClientInput): Client {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO clients (id, name, phone_number_id, webhook_url, auth_token, meta_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.name, input.phone_number_id, input.webhook_url, input.auth_token || null, input.meta_token);
    return this.getClientById(id)!;
  }

  updateClient(id: string, input: UpdateClientInput): Client | null {
    const existing = this.getClientById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.phone_number_id !== undefined) { fields.push('phone_number_id = ?'); values.push(input.phone_number_id); }
    if (input.webhook_url !== undefined) { fields.push('webhook_url = ?'); values.push(input.webhook_url); }
    if (input.auth_token !== undefined) { fields.push('auth_token = ?'); values.push(input.auth_token); }
    if (input.meta_token !== undefined) { fields.push('meta_token = ?'); values.push(input.meta_token); }
    if (input.active !== undefined) { fields.push('active = ?'); values.push(input.active); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getClientById(id);
  }

  deleteClient(id: string): boolean {
    const result = this.db.prepare('UPDATE clients SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const db = new DatabaseService();
