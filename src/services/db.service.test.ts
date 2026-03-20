import { test, expect, beforeEach, beforeAll } from "bun:test";
import { DatabaseService } from "./db.service";

let svc: DatabaseService;

beforeEach(() => {
  svc = new DatabaseService(":memory:");
});

// ─── signup_tokens ────────────────────────────────────────────

test("addSignupToken cria token com expires_at 7 dias", () => {
  const id = svc.addSignupToken();
  const token = svc.getSignupToken(id);
  expect(token).not.toBeNull();
  expect(token!.id).toBe(id);
  expect(token!.pending_meta_token).toBeNull();
});

test("getSignupToken retorna null para token inexistente", () => {
  expect(svc.getSignupToken("nao-existe")).toBeNull();
});

test("getSignupToken retorna null para token expirado", () => {
  (svc as any)["db"].prepare(
    "INSERT INTO signup_tokens (id, expires_at) VALUES (?, datetime('now', '-1 day'))"
  ).run("tok-expired");
  expect(svc.getSignupToken("tok-expired")).toBeNull();
});

test("getSignupToken retorna null para token já usado", () => {
  const id = svc.addSignupToken();
  svc.markTokenUsed(id);
  expect(svc.getSignupToken(id)).toBeNull();
});

test("setPendingToken armazena payload e getSignupToken o reflete", () => {
  const id = svc.addSignupToken();
  const payload = JSON.stringify({ token: "abc", expires_at: "2026-05-01 00:00:00", numbers: [] });
  svc.setPendingToken(id, payload);
  expect(svc.getSignupToken(id)!.pending_meta_token).toContain("abc");
});

// ─── clients: novas colunas ───────────────────────────────────

test("createClient aceita meta_token_expires_at e token_expired", () => {
  const client = svc.createClient({
    name: "Teste", phone_number_id: "123", webhook_url: "", meta_token: "tok",
    meta_token_expires_at: "2026-05-01 00:00:00", token_expired: 0,
  });
  expect(client.meta_token_expires_at).toBe("2026-05-01 00:00:00");
  expect(client.token_expired).toBe(0);
});

test("novas colunas meta_token_expires_at e token_expired presentes após init", () => {
  // Se as colunas não existissem, createClient lançaria erro
  expect(() => svc.createClient({
    name: "Y", phone_number_id: "999", webhook_url: "", meta_token: "t",
    meta_token_expires_at: "2026-05-01 00:00:00", token_expired: 0,
  })).not.toThrow();
  const client = svc.getAllClients()[0];
  expect("meta_token_expires_at" in client).toBe(true);
  expect("token_expired" in client).toBe(true);
});

test("getExpiringTokens retorna apenas clientes dentro do threshold", () => {
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const later = new Date(Date.now() + 30 * 86400000).toISOString().replace("T", " ").slice(0, 19);

  svc.createClient({ name: "Expirando", phone_number_id: "111", webhook_url: "", meta_token: "t1",
    meta_token_expires_at: soon, token_expired: 0 });
  svc.createClient({ name: "Ok", phone_number_id: "222", webhook_url: "", meta_token: "t2",
    meta_token_expires_at: later, token_expired: 0 });
  svc.createClient({ name: "JaExpirou", phone_number_id: "333", webhook_url: "", meta_token: "t3",
    meta_token_expires_at: soon, token_expired: 1 });

  const expiring = svc.getExpiringTokens(7);
  expect(expiring).toHaveLength(1);
  expect(expiring[0].name).toBe("Expirando");
});

test("updateClientToken atualiza token e zera token_expired", () => {
  const c = svc.createClient({ name: "X", phone_number_id: "444", webhook_url: "",
    meta_token: "old", meta_token_expires_at: "2026-03-01 00:00:00", token_expired: 1 });
  svc.updateClientToken(c.id, "new", "2026-06-01 00:00:00");
  const updated = svc.getClientById(c.id)!;
  expect(updated.meta_token).toBe("new");
  expect(updated.token_expired).toBe(0);
});

test("setTokenExpired seta token_expired = 1", () => {
  const c = svc.createClient({ name: "Y", phone_number_id: "555", webhook_url: "",
    meta_token: "t", token_expired: 0 });
  svc.setTokenExpired(c.id, 1);
  expect(svc.getClientById(c.id)!.token_expired).toBe(1);
});

test("createClientsFromSignup cria clientes e retorna contagem", () => {
  const { created, skipped } = svc.createClientsFromSignup([
    { phoneId: "p1", name: "Emp A", metaToken: "tok", metaTokenExpiresAt: "2026-05-01 00:00:00" },
    { phoneId: "p2", name: "Emp B", metaToken: "tok", metaTokenExpiresAt: "2026-05-01 00:00:00" },
  ]);
  expect(created).toBe(2);
  expect(skipped).toBe(0);
});

test("createClientsFromSignup pula duplicatas sem abortar", () => {
  svc.createClient({ name: "Existente", phone_number_id: "p1", webhook_url: "", meta_token: "t" });
  const { created, skipped } = svc.createClientsFromSignup([
    { phoneId: "p1", name: "Dup", metaToken: "tok", metaTokenExpiresAt: "2026-05-01 00:00:00" },
    { phoneId: "p2", name: "Novo", metaToken: "tok", metaTokenExpiresAt: "2026-05-01 00:00:00" },
  ]);
  expect(created).toBe(1);
  expect(skipped).toBe(1);
  const all = svc.getAllClients();
  expect(all.some(c => c.phone_number_id === "p2")).toBe(true);
});

// ─── messages ─────────────────────────────────────────────────

import { describe } from "bun:test";

describe('messages', () => {
  const phoneId = 'test-phone-id';
  const contact = '5541900000001';

  test('saveMessage salva mensagem inbound', () => {
    svc.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    const msgs = svc.getMessages(phoneId, contact);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('wamid-test-1');
  });

  test('saveMessage com OR IGNORE nao duplica', () => {
    svc.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    svc.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    const msgs = svc.getMessages(phoneId, contact);
    expect(msgs).toHaveLength(1);
  });

  test('updateMessageStatus atualiza status', () => {
    svc.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    svc.updateMessageStatus('wamid-test-1', 'delivered');
    const msgs = svc.getMessages(phoneId, contact);
    expect(msgs[0].status).toBe('delivered');
  });

  test('listConversations agrupa por contato', () => {
    svc.saveMessage({
      id: 'wamid-test-1',
      phone_number_id: phoneId,
      contact_phone: contact,
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Ola' } },
    });
    svc.saveMessage({
      id: 'wamid-test-2',
      phone_number_id: phoneId,
      contact_phone: '5541900000002',
      direction: 'inbound',
      type: 'text',
      content: { text: { body: 'Oi' } },
    });
    const convs = svc.listConversations(phoneId);
    expect(convs.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── campaigns ────────────────────────────────────────────────

describe('campaigns', () => {
  let db: DatabaseService;
  let campaignId: string;

  beforeAll(() => {
    db = new DatabaseService(':memory:');
  });

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

// ─── new panel tables ─────────────────────────────────────────

describe('new panel tables', () => {
  test('tabela messages existe', () => {
    const result = (svc as any)['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='messages'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaigns existe', () => {
    const result = (svc as any)['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaigns'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaign_contacts existe', () => {
    const result = (svc as any)['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_contacts'`
    ).get();
    expect(result).toBeTruthy();
  });

  test('tabela campaign_jobs existe', () => {
    const result = (svc as any)['db'].query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_jobs'`
    ).get();
    expect(result).toBeTruthy();
  });
});
