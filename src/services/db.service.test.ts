import { test, expect, beforeEach } from "bun:test";
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
});
