# Plano 1: Foundation — DB + Router + Webhook + SPA Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a infra-estrutura base para o painel WhatsApp: novas tabelas no banco, rotas /api/v2/* autenticadas por sessão, endpoint de contas, salvamento de mensagens no webhook, e scaffold da React SPA servida em /painel/*.

**Architecture:** As novas tabelas são adicionadas ao init() do db.service.ts existente. O router recebe um bloco /api/v2/ inserido ANTES do bloco /api/ existente (evita interseção com validateApiKey). O servidor usa routes do Bun.serve para a SPA e mantém fetch: appRouter para o restante.

**Tech Stack:** Bun, SQLite (bun:sqlite), React 18, TypeScript, Tailwind CSS via CDN, react-router-dom, xlsx

**Spec:** docs/superpowers/specs/2026-03-20-whatsapp-campaign-panel-design.md

---

## Mapa de Arquivos

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| src/services/db.service.ts | Modificar | Novas tabelas + tipos + metodos |
| src/routes/router.ts | Modificar | Bloco /api/v2/ + wildcard /painel/* |
| src/controllers/panel.controller.ts | Criar | Handler GET /api/v2/accounts |
| src/controllers/webhook.controller.ts | Modificar | Salvar messages + atualizar campaign_contacts |
| src/server.ts | Modificar | routes SPA via Bun HTML import |
| src/frontend/index.html | Criar | Entry point da SPA |
| src/frontend/App.tsx | Criar | Raiz React com roteamento |
| src/frontend/components/Layout.tsx | Criar | Sidebar + wrapper |
| src/frontend/components/AccountSelector.tsx | Criar | Dropdown de contas |
| src/frontend/components/StatusBadge.tsx | Criar | Pill de status colorido |
| src/frontend/components/MetricCard.tsx | Criar | Card de metrica com icone |
| src/frontend/pages/NotFound.tsx | Criar | Pagina 404 da SPA |
| src/services/db.service.test.ts | Modificar | Testes das novas tabelas |

---

## Task 1: Instalar dependencias

- [ ] **1.1 Instalar React e libs de SPA**
```
bun add react react-dom react-router-dom
bun add -d @types/react @types/react-dom
```

- [ ] **1.2 Instalar xlsx**
```
bun add xlsx
```

- [ ] **1.3 Verificar instalacao**
```
bun pm ls | grep -E "react|xlsx"
```
Esperado: react, react-dom, react-router-dom, xlsx listados.

- [ ] **1.4 Commit**
```
git add package.json bun.lockb
git commit -m "chore: instala react, react-router-dom e xlsx"
```

---

## Task 2: Migracao do banco — novas tabelas

**Files:**
- Modify: src/services/db.service.ts
- Modify: src/services/db.service.test.ts

- [ ] **2.1 Escrever testes que verificam existencia das tabelas**

Adicionar ao final de src/services/db.service.test.ts:

```typescript
describe('new panel tables', () => {
  test('tabela messages existe', () => {
    const result = db['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='messages'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaigns existe', () => {
    const result = db['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaigns'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaign_contacts existe', () => {
    const result = db['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_contacts'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaign_jobs existe', () => {
    const result = db['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_jobs'`
    ).get();
    expect(result).toBeTruthy();
  });
});
```

- [ ] **2.2 Rodar para confirmar falha**
```
bun test src/services/db.service.test.ts --filter "new panel tables"
```
Esperado: 4 falhas.

- [ ] **2.3 Adicionar tabelas ao init() do db.service.ts**

Localizar o final do metodo init() antes do console.log e adicionar:

```typescript
    // Painel: mensagens (inbox)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        phone_number_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        direction TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        campaign_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(phone_number_id, contact_phone, created_at);
    `);

    // Painel: campanhas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
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
      );
    `);

    // Painel: contatos por campanha
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_contacts (
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
      );
      CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign
        ON campaign_contacts(campaign_id, status);
      CREATE INDEX IF NOT EXISTS idx_campaign_contacts_wamid
        ON campaign_contacts(wamid);
    `);

    // Painel: fila de jobs de envio
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        contact_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_campaign_jobs_next
        ON campaign_jobs(status, next_attempt_at);
    `);
```

- [ ] **2.4 Rodar testes**
```
bun test src/services/db.service.test.ts --filter "new panel tables"
```
Esperado: 4 passes.

- [ ] **2.5 Rodar suite completa**
```
bun test src/services/db.service.test.ts
```

- [ ] **2.6 Commit**
```
git add src/services/db.service.ts src/services/db.service.test.ts
git commit -m "feat(db): adiciona tabelas messages, campaigns, campaign_contacts e campaign_jobs"
```

---

## Task 3: DB Service — tipos e metodos para messages

**Files:**
- Modify: src/services/db.service.ts
- Modify: src/services/db.service.test.ts

- [ ] **3.1 Adicionar tipos apos os tipos GHL existentes em db.service.ts**

```typescript
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
```

- [ ] **3.2 Escrever testes**

Adicionar em db.service.test.ts:

```typescript
describe('messages', () => {
  const phoneId = 'test-phone-id';
  const contact = '5541900000001';

  test('saveMessage salva mensagem inbound', () => {
    db.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    const msgs = db.getMessages(phoneId, contact);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('wamid-test-1');
  });

  test('saveMessage com OR IGNORE nao duplica', () => {
    db.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    const msgs = db.getMessages(phoneId, contact);
    expect(msgs).toHaveLength(1);
  });

  test('updateMessageStatus atualiza status', () => {
    db.updateMessageStatus('wamid-test-1', 'delivered');
    const msgs = db.getMessages(phoneId, contact);
    expect(msgs[0].status).toBe('delivered');
  });

  test('listConversations agrupa por contato', () => {
    db.saveMessage({
      id: 'wamid-test-2',
      phone_number_id: phoneId,
      contact_phone: '5541900000002',
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Oi' } },
    });
    const convs = db.listConversations(phoneId);
    expect(convs.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **3.3 Rodar para confirmar falha**
```
bun test src/services/db.service.test.ts --filter "messages"
```

- [ ] **3.4 Implementar metodos no DatabaseService apos os metodos GHL**

```typescript
  // Messages

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
```

- [ ] **3.5 Rodar testes**
```
bun test src/services/db.service.test.ts --filter "messages"
```

- [ ] **3.6 Commit**
```
git add src/services/db.service.ts src/services/db.service.test.ts
git commit -m "feat(db): adiciona saveMessage, updateMessageStatus, listConversations, getMessages"
```

---

## Task 4: DB Service — campaigns e campaign_contacts

**Files:**
- Modify: src/services/db.service.ts
- Modify: src/services/db.service.test.ts

- [ ] **4.1 Adicionar tipos**

```typescript
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
  status?: string; // 'running' para disparo imediato, 'pending' para agendado
}
```

- [ ] **4.2 Escrever testes**

```typescript
describe('campaigns', () => {
  let campaignId: string;

  test('createCampaign status=running quando sem scheduled_at', () => {
    const c = db.createCampaign({
      name: 'Teste',
      phone_number_id: 'phone-test',
      template_name: 'promo',
      template_language: 'pt_BR',
      variable_mapping: { '{{1}}': 'nome' },
      total_contacts: 2,
    });
    expect(c.id).toBeDefined();
    expect(c.status).toBe('running');
    campaignId = c.id;
  });

  test('createCampaign status=pending quando tem scheduled_at', () => {
    const c = db.createCampaign({
      name: 'Agendada',
      phone_number_id: 'phone-test',
      template_name: 'promo',
      template_language: 'pt_BR',
      variable_mapping: {},
      total_contacts: 0,
      scheduled_at: '2026-12-31T10:00:00Z',
    });
    expect(c.status).toBe('pending');
  });

  test('getCampaign retorna campanha', () => {
    const c = db.getCampaign(campaignId);
    expect(c?.name).toBe('Teste');
  });

  test('listCampaigns retorna lista', () => {
    const list = db.listCampaigns();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  test('updateCampaignStatus altera status', () => {
    db.updateCampaignStatus(campaignId, 'paused');
    const c = db.getCampaign(campaignId);
    expect(c?.status).toBe('paused');
  });

  test('insertCampaignContacts bulk', () => {
    db.insertCampaignContacts(campaignId, [
      { phone: '5541900000001', variables: { nome: 'Ana' } },
      { phone: '5541900000002', variables: { nome: 'Bob' } },
    ]);
    const contacts = db.listCampaignContacts(campaignId);
    expect(contacts.length).toBe(2);
  });

  test('getCampaignMetrics conta por status', () => {
    const m = db.getCampaignMetrics(campaignId);
    expect(m.total).toBe(2);
    expect(m.pending).toBe(2);
  });

  test('updateCampaignContactByWamid delivered', () => {
    const contacts = db.listCampaignContacts(campaignId);
    db.setCampaignContactWamid(contacts[0].id, 'wamid-camp-1');
    db.updateCampaignContactByWamid('wamid-camp-1', 'delivered', '2026-03-20T10:00:00Z');
    const updated = db.listCampaignContacts(campaignId);
    expect(updated[0].status).toBe('delivered');
  });

  test('countSentToday retorna 0 para numero sem envios', () => {
    expect(db.countSentToday('nenhum-numero')).toBe(0);
  });
});
```

- [ ] **4.3 Rodar para confirmar falha**
```
bun test src/services/db.service.test.ts --filter "campaigns"
```

- [ ] **4.4 Implementar metodos**

```typescript
  // Campaigns

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
```

- [ ] **4.5 Rodar testes**
```
bun test src/services/db.service.test.ts --filter "campaigns"
bun test src/services/db.service.test.ts
```

- [ ] **4.6 Commit**
```
git add src/services/db.service.ts src/services/db.service.test.ts
git commit -m "feat(db): adiciona metodos CRUD para campaigns e campaign_contacts"
```

---

## Task 5: DB Service — campaign_jobs (fila do worker)

**Files:**
- Modify: src/services/db.service.ts
- Modify: src/services/db.service.test.ts

- [ ] **5.1 Adicionar tipo**

```typescript
export interface CampaignJob {
  id: number;
  campaign_id: string;
  contact_id: number;
  status: 'queued' | 'processing' | 'done' | 'failed';
  attempts: number;
  next_attempt_at: string;
  created_at: string;
}
```

- [ ] **5.2 Escrever testes**

```typescript
describe('campaign_jobs', () => {
  let cId: string;
  let contactId: number;

  test('setup: cria campanha e contato', () => {
    const c = db.createCampaign({
      name: 'Jobs Test', phone_number_id: 'pn-jobs',
      template_name: 'promo', template_language: 'pt_BR',
      variable_mapping: {}, total_contacts: 1,
    });
    cId = c.id;
    db.insertCampaignContacts(cId, [{ phone: '5541900000099', variables: {} }]);
    contactId = db.listCampaignContacts(cId)[0].id;
  });

  test('insertCampaignJobs cria jobs queued', () => {
    db.insertCampaignJobs(cId, [contactId]);
    const job = db.getNextJob(cId);
    expect(job?.contact_id).toBe(contactId);
    expect(job?.status).toBe('queued');
  });

  test('updateJobStatus para processing esconde do getNextJob', () => {
    const job = db.getNextJob(cId)!;
    db.updateJobStatus(job.id, 'processing');
    expect(db.getNextJob(cId)).toBeNull();
  });

  test('countActiveJobs conta queued + processing', () => {
    expect(db.countActiveJobs(cId)).toBe(1);
  });

  test('markJobDone atualiza job e contact', () => {
    const contacts = db.listCampaignContacts(cId);
    // precisa de um job processing para marcar done
    db.insertCampaignJobs(cId, [contacts[0].id]);
    const job = db.getNextJob(cId)!;
    db.updateJobStatus(job.id, 'processing');
    db.markJobDone(job.id, contacts[0].id, 'wamid-done-1');
    const updated = db.getCampaignContact(contacts[0].id);
    expect(updated?.wamid).toBe('wamid-done-1');
    expect(updated?.status).toBe('sent');
  });

  test('cancelJobsForCampaign cancela queued', () => {
    const contacts = db.listCampaignContacts(cId);
    db.insertCampaignJobs(cId, [contacts[0].id]);
    db.cancelJobsForCampaign(cId);
    expect(db.getNextJob(cId)).toBeNull();
  });
});
```

- [ ] **5.3 Rodar para confirmar falha**
```
bun test src/services/db.service.test.ts --filter "campaign_jobs"
```

- [ ] **5.4 Implementar metodos**

```typescript
  // Campaign Jobs

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
```

- [ ] **5.5 Rodar testes**
```
bun test src/services/db.service.test.ts
```

- [ ] **5.6 Commit**
```
git add src/services/db.service.ts src/services/db.service.test.ts
git commit -m "feat(db): adiciona metodos para fila campaign_jobs"
```

---

## Task 6: Router — bloco /api/v2 e wildcard /painel

**Files:**
- Create: src/controllers/panel.controller.ts
- Modify: src/routes/router.ts

- [ ] **6.1 Criar panel.controller.ts**

```typescript
// src/controllers/panel.controller.ts
import { db } from '../services/db.service';

export class PanelController {
  static listAccounts(): Response {
    const clients = db.getActiveClients();
    return Response.json(
      clients.map(c => ({
        id: c.id,
        name: c.name,
        phone_number_id: c.phone_number_id,
        client_type: c.client_type,
      }))
    );
  }
}
```

- [ ] **6.2 Adicionar import e bloco /api/v2 no router.ts**

No topo de router.ts, adicionar:
```typescript
import { PanelController } from '../controllers/panel.controller';
```

Localizar a linha `if (pathname.startsWith("/api/")) {` e inserir TODO o bloco abaixo ANTES dela:

```typescript
  // Painel API v2 (session cookie) — DEVE ficar ANTES do /api/ para nao ser bloqueado por validateApiKey
  if (pathname.startsWith('/api/v2/')) {
    if (!isAuthenticated(req)) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'GET' && pathname === '/api/v2/accounts') {
      return PanelController.listAccounts();
    }

    // Placeholders — rotas de conversations, templates, campaigns adicionadas nos planos 2-4
    return new Response(JSON.stringify({ error: 'Rota v2 nao encontrada' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Painel SPA — redireciona se nao autenticado, senao serve o index.html via routes do Bun.serve
  if (pathname === '/painel' || pathname.startsWith('/painel/')) {
    if (!isAuthenticated(req)) {
      return new Response(null, { status: 302, headers: { Location: '/admin/login' } });
    }
    // O arquivo e servido via routes em server.ts, mas redirecionamento de auth acontece aqui
    return new Response(Bun.file('src/frontend/index.html'));
  }
```

- [ ] **6.3 Rodar todos os testes**
```
bun test
```

- [ ] **6.4 Smoke test manual**
```
bun run src/server.ts &
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v2/accounts
# Esperado: 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/clients
# Esperado: 401 (via validateApiKey, sem regressao)
kill %1
```

- [ ] **6.5 Commit**
```
git add src/routes/router.ts src/controllers/panel.controller.ts
git commit -m "feat(router): adiciona bloco /api/v2 com auth por sessao e wildcard /painel"
```

---

## Task 7: Webhook — salvar mensagens inbound e atualizar status de campanhas

**Files:**
- Modify: src/controllers/webhook.controller.ts

- [ ] **7.1 Adicionar saveMessage apos extracao da mensagem**

Localizar `const msgType = msg.type || 'text';` (~linha 50) e adicionar logo apos:

```typescript
          // Salva no inbox para todos os clientes (antes de rotear)
          db.saveMessage({
            id: waMessageId,
            phone_number_id: phoneId,
            contact_phone: from,
            direction: 'inbound',
            type: msgType,
            content: msg,
          });
```

- [ ] **7.2 Atualizar messages e campaign_contacts no bloco de statuses**

Localizar `const wamid = status.id;` dentro do bloco `if (changes?.statuses)` e adicionar apos o console.log de status:

```typescript
          // Atualiza status no inbox e em campanhas (todos os clientes)
          db.updateMessageStatus(wamid, statusName);
          if (statusName === 'delivered' || statusName === 'read' || statusName === 'failed') {
            db.updateCampaignContactByWamid(
              wamid,
              statusName as 'delivered' | 'read' | 'failed',
              status.timestamp,
              status.errors?.[0]?.code?.toString(),
              status.errors?.[0]?.title
            );
          }
```

- [ ] **7.3 Rodar todos os testes**
```
bun test
```

- [ ] **7.4 Commit**
```
git add src/controllers/webhook.controller.ts
git commit -m "feat(webhook): salva mensagens inbound e atualiza status de campanhas por wamid"
```

---

## Task 8: React SPA — scaffold base

**Files:**
- Create: src/frontend/index.html
- Create: src/frontend/App.tsx
- Create: src/frontend/components/Layout.tsx
- Create: src/frontend/components/StatusBadge.tsx
- Create: src/frontend/components/MetricCard.tsx
- Create: src/frontend/components/AccountSelector.tsx
- Create: src/frontend/pages/NotFound.tsx
- Modify: src/server.ts

- [ ] **8.1 Criar src/frontend/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HaruCode — Painel WhatsApp</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 text-gray-900">
  <div id="root"></div>
  <script type="module" src="./App.tsx"></script>
</body>
</html>
```

- [ ] **8.2 Criar src/frontend/App.tsx**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';

// Placeholders substituidos nos planos 2-4
const ConversationList = () => <div className="p-8 text-gray-500">Conversas (plano 2)</div>;
const TemplateList = () => <div className="p-8 text-gray-500">Templates (plano 3)</div>;
const CampaignList = () => <div className="p-8 text-gray-500">Campanhas (plano 4)</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/painel" element={<Layout />}>
          <Route index element={<Navigate to="/painel/campanhas" replace />} />
          <Route path="campanhas/*" element={<CampaignList />} />
          <Route path="templates/*" element={<TemplateList />} />
          <Route path="conversas/*" element={<ConversationList />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **8.3 Criar src/frontend/components/Layout.tsx**

```tsx
import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const NAV = [
  { to: '/painel/campanhas', label: 'Campanhas', icon: '📢' },
  { to: '/painel/templates', label: 'Templates', icon: '📋' },
  { to: '/painel/conversas', label: 'Conversas', icon: '💬' },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <span className="font-bold text-blue-600 text-sm">HaruCode Painel</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <a href="/admin" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ⚙️ Admin
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
```

- [ ] **8.4 Criar src/frontend/components/StatusBadge.tsx**

```tsx
import React from 'react';

const STYLES: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  read: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  approved: 'bg-green-100 text-green-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

const LABELS: Record<string, string> = {
  running: 'Em andamento', pending: 'Agendada', done: 'Concluida',
  paused: 'Pausada', cancelled: 'Cancelada', sent: 'Enviado',
  delivered: 'Entregue', read: 'Lido', failed: 'Falhou',
  approved: 'Aprovado', pending_review: 'Em revisao', rejected: 'Rejeitado',
};

export default function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[key] ?? 'bg-gray-100 text-gray-700'}`}>
      {LABELS[key] ?? status}
    </span>
  );
}
```

- [ ] **8.5 Criar src/frontend/components/MetricCard.tsx**

```tsx
import React from 'react';

interface Props {
  label: string; value: number; total?: number;
  color: 'blue' | 'green' | 'purple' | 'red' | 'gray';
  icon: string; onClick?: () => void; active?: boolean;
}

const COLORS = { blue: 'bg-blue-600', green: 'bg-green-500', purple: 'bg-purple-500', red: 'bg-red-500', gray: 'bg-gray-600' };

export default function MetricCard({ label, value, total, color, icon, onClick, active }: Props) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[140px] p-4 rounded-xl border-2 text-left ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
    >
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-white text-lg ${COLORS[color]}`}>{icon}</span>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {pct !== null && <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>}
    </button>
  );
}
```

- [ ] **8.6 Criar src/frontend/components/AccountSelector.tsx**

```tsx
import React, { useEffect, useState } from 'react';

interface Account { id: string; name: string; phone_number_id: string; client_type: string; }
interface Props { value: string; onChange: (v: string) => void; label?: string; }

export default function AccountSelector({ value, onChange, label }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => { if (r.status === 401) { window.location.href = '/admin/login'; } return r.json(); })
      .then(data => { setAccounts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-400">Carregando contas...</div>;
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Selecione uma conta...</option>
        {accounts.map(a => (
          <option key={a.phone_number_id} value={a.phone_number_id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **8.7 Criar src/frontend/pages/NotFound.tsx**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-6xl mb-4">404</div>
      <div className="text-gray-500 mb-4">Pagina nao encontrada</div>
      <Link to="/painel/campanhas" className="text-blue-600 hover:underline text-sm">
        Voltar para campanhas
      </Link>
    </div>
  );
}
```

- [ ] **8.8 Modificar src/server.ts para servir SPA**

```typescript
import { appRouter } from './routes/router';
import { env } from './config/env';
import { scheduleTokenRefreshJob } from './jobs/token-refresh.job';

// Nota: /painel/* e servido diretamente pelo appRouter (com auth check via isAuthenticated).
// Nao usar routes do Bun.serve para /painel — o fetch: appRouter cuida de autenticacao
// antes de servir o HTML, e routes tem precedencia sobre fetch (bypassa auth).

const server = Bun.serve({
  port: env.PORT,
  fetch: appRouter,
  development: process.env.NODE_ENV !== 'production' ? { hmr: true } : undefined,
});

console.log(`Servidor em http://localhost:${server.port}`);
console.log(`Webhook em http://localhost:${server.port}/webhook`);
console.log(`Painel em http://localhost:${server.port}/painel`);

scheduleTokenRefreshJob();
```

- [ ] **8.9 Rodar todos os testes**
```
bun test
```

- [ ] **8.10 Smoke test no browser**
```
bun run src/server.ts
# Acessa http://localhost:3000/painel no browser
# Deve redirecionar para /admin/login
# Apos login, exibe sidebar com 3 secoes
# Clicar nos itens da sidebar deve navegar sem 404
```

- [ ] **8.11 Commit**
```
git add src/frontend/ src/server.ts src/routes/router.ts
git commit -m "feat(spa): scaffold React com Layout, StatusBadge, MetricCard, AccountSelector"
```

---

## Verificacao Final do Plano 1

- [ ] Rodar suite completa:
```
bun test
```

- [ ] Confirmar que o servidor inicia sem erros:
```
bun run src/server.ts
```

- [ ] Confirmar que /painel redireciona para /admin/login quando sem sessao
- [ ] Confirmar que apos login o painel carrega com sidebar funcional

**Entregaveis:**
- Tabelas messages, campaigns, campaign_contacts, campaign_jobs no SQLite
- Todos os metodos DB com testes passando
- /api/v2/* autenticado por sessao (antes do /api/* existente)
- GET /api/v2/accounts retorna lista de contas
- Webhook salva mensagens inbound e atualiza status de campanhas
- SPA React servida em /painel/* com sidebar e roteamento

**Proximo:** Plano 2 — Conversations
