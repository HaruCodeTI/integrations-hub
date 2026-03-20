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

export interface Campaign {
  id: string;
  name: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  variable_mapping: string; // JSON
  status: 'pending' | 'running' | 'paused' | 'done' | 'cancelled';
  scheduled_at: string | null;
  delay_seconds: number;
  meta_tier: number;
  total_contacts: number;
  created_at: string;
}

export interface CampaignContact {
  id: number;
  campaign_id: string;
  phone: string;
  variables: string; // JSON
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
  wamid: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface CampaignMetrics {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
}

export interface CreateCampaignInput {
  name: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  variable_mapping: object;
  scheduled_at?: string | null;
  delay_seconds?: number;
  meta_tier?: number;
  total_contacts: number;
  status?: string;
}

export interface CampaignJob {
  id: number;
  campaign_id: string;
  contact_id: number;
  status: 'queued' | 'processing' | 'done' | 'failed';
  attempts: number;
  next_attempt_at: string;
  created_at: string;
}

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

// ─── Messages Types ──────────────────────────────────────────

export interface Message {
  id: string;
  phone_number_id: string;
  contact_phone: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string; // JSON string
  status: string;
  campaign_id: string | null;
  created_at: string;
}

export interface ConversationSummary {
  contact_phone: string;
  last_at: string;
  last_content: string;
}

export interface SaveMessageInput {
  id: string;
  phone_number_id: string;
  contact_phone: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: object;
  status?: string;
  campaign_id?: string | null;
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

    // Painel: mensagens (inbox)
    this.db.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        phone_number_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        direction TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        campaign_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(phone_number_id, contact_phone, created_at)`);

    // Painel: campanhas
    this.db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone_number_id TEXT NOT NULL,
        template_name TEXT NOT NULL,
        template_language TEXT NOT NULL,
        variable_mapping TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_at TEXT,
        delay_seconds INTEGER NOT NULL DEFAULT 3,
        meta_tier INTEGER NOT NULL DEFAULT 1,
        total_contacts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

    // Painel: contatos por campanha
    this.db.exec(`CREATE TABLE IF NOT EXISTS campaign_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        variables TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        wamid TEXT,
        error_code TEXT,
        error_message TEXT,
        sent_at TEXT,
        delivered_at TEXT,
        read_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign
        ON campaign_contacts(campaign_id, status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_contacts_wamid
        ON campaign_contacts(wamid)`);

    // Painel: fila de jobs de envio
    this.db.exec(`CREATE TABLE IF NOT EXISTS campaign_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        contact_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_jobs_next
        ON campaign_jobs(status, next_attempt_at)`);

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

  // ─── Messages ──────────────────────────────────────────────

  saveMessage(input: SaveMessageInput): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO messages
        (id, phone_number_id, contact_phone, direction, type, content, status, campaign_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.phone_number_id, input.contact_phone, input.direction,
      input.type, JSON.stringify(input.content), input.status ?? 'sent',
      input.campaign_id ?? null
    );
  }

  updateMessageStatus(wamid: string, status: string): void {
    this.db.prepare(`UPDATE messages SET status = ? WHERE id = ?`).run(status, wamid);
  }

  listConversations(phone_number_id: string): ConversationSummary[] {
    return this.db.query(`
      SELECT
        contact_phone,
        MAX(created_at) as last_at,
        (SELECT content FROM messages m2
         WHERE m2.phone_number_id = m1.phone_number_id
           AND m2.contact_phone = m1.contact_phone
         ORDER BY created_at DESC LIMIT 1) as last_content
      FROM messages m1
      WHERE phone_number_id = ?
      GROUP BY contact_phone
      ORDER BY last_at DESC
    `).all(phone_number_id) as ConversationSummary[];
  }

  getMessages(phone_number_id: string, contact_phone: string): Message[] {
    return this.db.query(`
      SELECT * FROM messages
      WHERE phone_number_id = ? AND contact_phone = ?
      ORDER BY created_at ASC
    `).all(phone_number_id, contact_phone) as Message[];
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

  // ─── Campaigns ─────────────────────────────────────────────

  createCampaign(input: CreateCampaignInput): Campaign {
    const id = randomUUID();
    const status = input.scheduled_at ? 'pending' : 'running';
    this.db.prepare(`
      INSERT INTO campaigns
        (id, name, phone_number_id, template_name, template_language,
         variable_mapping, status, scheduled_at, delay_seconds, meta_tier, total_contacts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.phone_number_id, input.template_name, input.template_language,
      JSON.stringify(input.variable_mapping), status, input.scheduled_at ?? null,
      input.delay_seconds ?? 3, input.meta_tier ?? 1, input.total_contacts
    );
    return this.getCampaign(id)!;
  }

  getCampaign(id: string): Campaign | null {
    return this.db.query(`SELECT * FROM campaigns WHERE id = ?`).get(id) as Campaign | null;
  }

  listCampaigns(status?: string): Campaign[] {
    if (status) {
      return this.db.query(
        `SELECT * FROM campaigns WHERE status = ? ORDER BY created_at DESC`
      ).all(status) as Campaign[];
    }
    return this.db.query(`SELECT * FROM campaigns ORDER BY created_at DESC`).all() as Campaign[];
  }

  updateCampaignStatus(id: string, status: Campaign['status']): void {
    this.db.prepare(`UPDATE campaigns SET status = ? WHERE id = ?`).run(status, id);
  }

  getRunningCampaigns(): Campaign[] {
    return this.db.query(`
      SELECT * FROM campaigns
      WHERE status = 'running'
        AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
    `).all() as Campaign[];
  }

  insertCampaignContacts(campaign_id: string, contacts: Array<{ phone: string; variables: object }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO campaign_contacts (campaign_id, phone, variables) VALUES (?, ?, ?)
    `);
    const insertAll = this.db.transaction((items: Array<{ phone: string; variables: object }>) => {
      for (const c of items) {
        stmt.run(campaign_id, c.phone, JSON.stringify(c.variables));
      }
    });
    insertAll(contacts);
  }

  listCampaignContacts(campaign_id: string, status?: string, page = 1, perPage = 50): CampaignContact[] {
    const offset = (page - 1) * perPage;
    if (status) {
      return this.db.query(`
        SELECT * FROM campaign_contacts WHERE campaign_id = ? AND status = ?
        ORDER BY id ASC LIMIT ? OFFSET ?
      `).all(campaign_id, status, perPage, offset) as CampaignContact[];
    }
    return this.db.query(`
      SELECT * FROM campaign_contacts WHERE campaign_id = ?
      ORDER BY id ASC LIMIT ? OFFSET ?
    `).all(campaign_id, perPage, offset) as CampaignContact[];
  }

  getCampaignContact(id: number): CampaignContact | null {
    return this.db.query(`SELECT * FROM campaign_contacts WHERE id = ?`).get(id) as CampaignContact | null;
  }

  getCampaignMetrics(campaign_id: string): CampaignMetrics {
    const row = this.db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM campaign_contacts WHERE campaign_id = ?
    `).get(campaign_id) as any;
    return row ?? { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, cancelled: 0 };
  }

  setCampaignContactWamid(contact_id: number, wamid: string): void {
    this.db.prepare(`
      UPDATE campaign_contacts SET wamid = ?, status = 'sent', sent_at = datetime('now')
      WHERE id = ?
    `).run(wamid, contact_id);
  }

  updateCampaignContactByWamid(
    wamid: string,
    status: 'delivered' | 'read' | 'failed',
    timestamp?: string,
    errorCode?: string,
    errorMessage?: string
  ): void {
    if (status === 'delivered') {
      this.db.prepare(
        `UPDATE campaign_contacts SET status = 'delivered', delivered_at = ? WHERE wamid = ?`
      ).run(timestamp ?? new Date().toISOString(), wamid);
    } else if (status === 'read') {
      this.db.prepare(
        `UPDATE campaign_contacts SET status = 'read', read_at = ? WHERE wamid = ?`
      ).run(timestamp ?? new Date().toISOString(), wamid);
    } else {
      this.db.prepare(
        `UPDATE campaign_contacts SET status = 'failed', error_code = ?, error_message = ? WHERE wamid = ?`
      ).run(errorCode ?? null, errorMessage ?? null, wamid);
    }
  }

  cancelCampaignContacts(campaign_id: string): void {
    this.db.prepare(
      `UPDATE campaign_contacts SET status = 'cancelled' WHERE campaign_id = ? AND status = 'pending'`
    ).run(campaign_id);
  }

  countSentToday(phone_number_id: string): number {
    const row = this.db.query(`
      SELECT COUNT(*) as count
      FROM campaign_contacts cc
      JOIN campaigns c ON cc.campaign_id = c.id
      WHERE c.phone_number_id = ?
        AND cc.status IN ('sent', 'delivered', 'read')
        AND cc.sent_at >= date('now')
    `).get(phone_number_id) as { count: number } | null;
    return row?.count ?? 0;
  }

  // ─── Campaign Jobs ──────────────────────────────────────────

  insertCampaignJobs(campaign_id: string, contact_ids: number[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO campaign_jobs (campaign_id, contact_id) VALUES (?, ?)`
    );
    const insertAll = this.db.transaction((ids: number[]) => {
      for (const contact_id of ids) stmt.run(campaign_id, contact_id);
    });
    insertAll(contact_ids);
  }

  getNextJob(campaign_id: string): CampaignJob | null {
    return this.db.query(`
      SELECT * FROM campaign_jobs
      WHERE campaign_id = ? AND status = 'queued' AND next_attempt_at <= datetime('now')
      ORDER BY next_attempt_at ASC LIMIT 1
    `).get(campaign_id) as CampaignJob | null;
  }

  updateJobStatus(job_id: number, status: CampaignJob['status'], attempts?: number, next_attempt_at?: string): void {
    if (attempts !== undefined && next_attempt_at !== undefined) {
      this.db.prepare(
        `UPDATE campaign_jobs SET status = ?, attempts = ?, next_attempt_at = ? WHERE id = ?`
      ).run(status, attempts, next_attempt_at, job_id);
    } else {
      this.db.prepare(`UPDATE campaign_jobs SET status = ? WHERE id = ?`).run(status, job_id);
    }
  }

  markJobDone(job_id: number, contact_id: number, wamid: string): void {
    this.db.transaction(() => {
      this.db.prepare(`UPDATE campaign_jobs SET status = 'done' WHERE id = ?`).run(job_id);
      this.db.prepare(`
        UPDATE campaign_contacts SET wamid = ?, status = 'sent', sent_at = datetime('now') WHERE id = ?
      `).run(wamid, contact_id);
    })();
  }

  markJobFailed(job_id: number, contact_id: number, errorCode?: string, errorMessage?: string): void {
    this.db.transaction(() => {
      this.db.prepare(`UPDATE campaign_jobs SET status = 'failed' WHERE id = ?`).run(job_id);
      this.db.prepare(`
        UPDATE campaign_contacts SET status = 'failed', error_code = ?, error_message = ? WHERE id = ?
      `).run(errorCode ?? null, errorMessage ?? null, contact_id);
    })();
  }

  countActiveJobs(campaign_id: string): number {
    const row = this.db.query(`
      SELECT COUNT(*) as count FROM campaign_jobs
      WHERE campaign_id = ? AND status IN ('queued', 'processing')
    `).get(campaign_id) as { count: number } | null;
    return row?.count ?? 0;
  }

  cancelJobsForCampaign(campaign_id: string): void {
    this.db.prepare(`
      UPDATE campaign_jobs SET status = 'failed'
      WHERE campaign_id = ? AND status IN ('queued', 'processing')
    `).run(campaign_id);
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
