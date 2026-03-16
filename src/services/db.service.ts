import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

export type ClientType = 'webhook' | 'ghl';

export interface Client {
  id: string;
  name: string;
  phone_number_id: string;
  webhook_url: string;
  auth_token: string | null;
  meta_token: string;
  client_type: ClientType;
  ghl_location_id: string | null;
  active: number;
  created_at: string;
  updated_at: string;
  meta_token_expires_at: string | null;
  token_expired: number;
}

export type CreateClientInput = {
  name: string;
  phone_number_id: string;
  webhook_url: string;
  auth_token?: string;
  meta_token: string;
  client_type?: ClientType;
  ghl_location_id?: string;
  active?: number;
  meta_token_expires_at?: string | null;
  token_expired?: number;
};

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'phone_number_id'>> & {
  phone_number_id?: string;
  active?: number;
};

// ─── GHL Types ──────────────────────────────────────────────

export interface GhlLocation {
  location_id: string;
  company_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type UpsertGhlLocationInput = {
  location_id: string;
  company_id?: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export interface GhlContact {
  id: number;
  location_id: string;
  contact_id: string;
  phone_number: string;
  created_at: string;
}

export class DatabaseService {
  private db: Database;

  constructor(dbPath: string = 'gateway.db') {
    this.db = new Database(dbPath);
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
        client_type TEXT DEFAULT 'webhook',
        ghl_location_id TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Migração: adiciona colunas novas se não existem (safe para DB existente)
    try { this.db.exec(`ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT 'webhook'`); } catch {}
    try { this.db.exec(`ALTER TABLE clients ADD COLUMN ghl_location_id TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE clients ADD COLUMN meta_token_expires_at TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE clients ADD COLUMN token_expired INTEGER DEFAULT 0`); } catch {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signup_tokens (
        id                 TEXT PRIMARY KEY,
        created_at         TEXT DEFAULT (datetime('now')),
        expires_at         TEXT NOT NULL,
        used_at            TEXT,
        pending_meta_token TEXT
      );
    `);

    // Tabela de locations GHL (tokens OAuth por sub-account)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ghl_locations (
        location_id TEXT PRIMARY KEY,
        company_id TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Tabela de mapeamento contato GHL ↔ número WhatsApp
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ghl_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(location_id, phone_number)
      );
    `);

    // Tabela de mapeamento wamid ↔ GHL messageId (para status delivered/read)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_mappings (
        wamid TEXT PRIMARY KEY,
        ghl_message_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Limpa mapeamentos antigos (> 7 dias) para não acumular lixo
    this.db.exec(`
      DELETE FROM message_mappings WHERE created_at < datetime('now', '-7 days');
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

  getClientByGhlLocationId(locationId: string): Client | null {
    return this.db.query('SELECT * FROM clients WHERE ghl_location_id = ? AND active = 1').get(locationId) as Client | null;
  }

  createClient(input: CreateClientInput): Client {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO clients
        (id, name, phone_number_id, webhook_url, auth_token, meta_token,
         client_type, ghl_location_id, meta_token_expires_at, token_expired)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, input.name, input.phone_number_id, input.webhook_url,
      input.auth_token || null, input.meta_token,
      input.client_type || 'webhook', input.ghl_location_id || null,
      input.meta_token_expires_at || null, input.token_expired ?? 0
    );
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
    if (input.client_type !== undefined) { fields.push('client_type = ?'); values.push(input.client_type); }
    if (input.ghl_location_id !== undefined) { fields.push('ghl_location_id = ?'); values.push(input.ghl_location_id); }
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

  // ─── GHL Locations (OAuth tokens) ──────────────────────────

  getGhlLocation(locationId: string): GhlLocation | null {
    return this.db.query('SELECT * FROM ghl_locations WHERE location_id = ?').get(locationId) as GhlLocation | null;
  }

  getAllGhlLocations(): GhlLocation[] {
    return this.db.query('SELECT * FROM ghl_locations ORDER BY created_at DESC').all() as GhlLocation[];
  }

  upsertGhlLocation(input: UpsertGhlLocationInput): GhlLocation {
    const existing = this.getGhlLocation(input.location_id);
    if (existing) {
      this.db.prepare(`
        UPDATE ghl_locations
        SET access_token = ?, refresh_token = ?, expires_at = ?, company_id = ?, updated_at = datetime('now')
        WHERE location_id = ?
      `).run(input.access_token, input.refresh_token, input.expires_at, input.company_id || null, input.location_id);
    } else {
      this.db.prepare(`
        INSERT INTO ghl_locations (location_id, company_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.location_id, input.company_id || null, input.access_token, input.refresh_token, input.expires_at);
    }
    return this.getGhlLocation(input.location_id)!;
  }

  deleteGhlLocation(locationId: string): boolean {
    const result = this.db.prepare('DELETE FROM ghl_locations WHERE location_id = ?').run(locationId);
    return result.changes > 0;
  }

  // ─── GHL Contacts (mapeamento phone ↔ contactId) ──────────

  getGhlContact(locationId: string, phoneNumber: string): GhlContact | null {
    return this.db.query(
      'SELECT * FROM ghl_contacts WHERE location_id = ? AND phone_number = ?'
    ).get(locationId, phoneNumber) as GhlContact | null;
  }

  // ─── Message Mappings (wamid ↔ GHL messageId) ───────────

  saveMessageMapping(wamid: string, ghlMessageId: string, locationId: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO message_mappings (wamid, ghl_message_id, location_id)
      VALUES (?, ?, ?)
    `).run(wamid, ghlMessageId, locationId);
  }

  getMessageMapping(wamid: string): { ghl_message_id: string; location_id: string } | null {
    return this.db.query(
      'SELECT ghl_message_id, location_id FROM message_mappings WHERE wamid = ?'
    ).get(wamid) as { ghl_message_id: string; location_id: string } | null;
  }

  cleanOldMappings(): number {
    const result = this.db.prepare(
      `DELETE FROM message_mappings WHERE created_at < datetime('now', '-7 days')`
    ).run();
    return result.changes;
  }

  // ─── GHL Contacts (mapeamento phone ↔ contactId) ──────────

  upsertGhlContact(locationId: string, contactId: string, phoneNumber: string): void {
    this.db.prepare(`
      INSERT INTO ghl_contacts (location_id, contact_id, phone_number)
      VALUES (?, ?, ?)
      ON CONFLICT(location_id, phone_number) DO UPDATE SET contact_id = ?
    `).run(locationId, contactId, phoneNumber, contactId);
  }

  // ─── Signup Tokens ─────────────────────────────────────────

  addSignupToken(): string {
    const id = randomUUID();
    this.db.prepare(
      "INSERT INTO signup_tokens (id, expires_at) VALUES (?, datetime('now', '+7 days'))"
    ).run(id);
    return id;
  }

  getSignupToken(id: string): { id: string; pending_meta_token: string | null } | null {
    return this.db.query(`
      SELECT id, pending_meta_token FROM signup_tokens
      WHERE id = ? AND expires_at > datetime('now') AND used_at IS NULL
    `).get(id) as { id: string; pending_meta_token: string | null } | null;
  }

  setPendingToken(id: string, payload: string): void {
    this.db.prepare("UPDATE signup_tokens SET pending_meta_token = ? WHERE id = ?").run(payload, id);
  }

  markTokenUsed(id: string): void {
    this.db.prepare("UPDATE signup_tokens SET used_at = datetime('now') WHERE id = ?").run(id);
  }

  // ─── Token Renewal ─────────────────────────────────────────

  getExpiringTokens(thresholdDays: number): Client[] {
    return this.db.query(`
      SELECT * FROM clients
      WHERE meta_token_expires_at < datetime('now', ?)
        AND meta_token_expires_at IS NOT NULL
        AND meta_token IS NOT NULL
        AND meta_token != ''
        AND token_expired = 0
    `).all(`+${thresholdDays} days`) as Client[];
  }

  updateClientToken(id: string, newToken: string, newExpiresAt: string): void {
    this.db.prepare(`
      UPDATE clients
      SET meta_token = ?, meta_token_expires_at = ?, token_expired = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(newToken, newExpiresAt, id);
  }

  setTokenExpired(id: string, value: 0 | 1): void {
    this.db.prepare(
      "UPDATE clients SET token_expired = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(value, id);
  }

  // ─── Signup: criação de clientes em transação ──────────────

  createClientsFromSignup(
    inputs: Array<{ phoneId: string; name: string; metaToken: string; metaTokenExpiresAt: string }>
  ): { created: number; skipped: number } {
    let created = 0, skipped = 0;

    const run = this.db.transaction(() => {
      for (const input of inputs) {
        try {
          this.createClient({
            name: input.name,
            phone_number_id: input.phoneId,
            webhook_url: "",
            meta_token: input.metaToken,
            meta_token_expires_at: input.metaTokenExpiresAt,
            client_type: "webhook",
            active: 1,
            token_expired: 0,
          });
          created++;
        } catch (err: any) {
          if (err?.message?.includes("UNIQUE")) { skipped++; }
          else { throw err; }
        }
      }
    });

    run();
    return { created, skipped };
  }
}

export const db = new DatabaseService();
