# Embedded Signup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar fluxo Meta Embedded Signup para onboarding automático de clientes WhatsApp — admin gera link, cliente autoriza, números são cadastrados automaticamente com token long-lived renovado por job diário.

**Architecture:** Link único com TTL 7 dias → página com FB JS SDK → troca de `code` por long-lived token server-side → seleção de números → criação de clientes em transação SQLite. Job diário renova tokens usando `expires_in` da API.

**Tech Stack:** Bun, bun:sqlite, bun test, Meta Graph API v21.0, Facebook JS SDK v21.0

**Spec:** `docs/superpowers/specs/2026-03-16-embedded-signup-design.md`

---

## Chunk 1: Fundações (DB + OAuth Service + Pages + Controller)

### Task 1: DB — signup_tokens + migração de clients

**Files:**
- Modify: `src/services/db.service.ts`
- Create: `src/services/db.service.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/db.service.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar — confirmar que falha**

```bash
bun test src/services/db.service.test.ts
```
Esperado: erros — `DatabaseService` não exportada / constructor sem path / métodos ausentes.

- [ ] **Step 3: Atualizar `src/services/db.service.ts`**

**3a.** Mudar constructor para aceitar path opcional:
```ts
constructor(private dbPath: string = 'gateway.db') {
  this.db = new Database(dbPath);
  this.db.exec('PRAGMA journal_mode = WAL;');
  this.init();
}
```
(Remover `private db: Database;` da declaração de campo e deixar o Database ser criado no constructor.)

**3b.** Adicionar ao interface `Client`:
```ts
meta_token_expires_at: string | null;
token_expired: number;
```

**3c.** Adicionar ao `CreateClientInput`:
```ts
meta_token_expires_at?: string | null;
token_expired?: number;
```

**3d.** No `init()`, após as migrações existentes de `clients`, adicionar:
```ts
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
```

**3e.** Atualizar `createClient` — mudar o INSERT para incluir os novos campos:
```ts
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
```

**3f.** Adicionar novos métodos antes do `}` de fechamento da classe:
```ts
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
        else { throw err; } // rollback da transação
      }
    }
  });

  run();
  return { created, skipped };
}
```

**3g.** Exportar a classe — adicionar antes de `export const db = new DatabaseService();`:
```ts
export { DatabaseService };
```

- [ ] **Step 4: Rodar testes**

```bash
bun test src/services/db.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/db.service.ts src/services/db.service.test.ts
git commit -m "feat: signup_tokens table, client token expiry fields, createClientsFromSignup"
```

---

### Task 2: meta-oauth.service.ts

**Files:**
- Create: `src/services/meta-oauth.service.ts`
- Create: `src/services/meta-oauth.service.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/meta-oauth.service.test.ts`:

```ts
import { test, expect, mock, beforeEach } from "bun:test";

let fetchMock: ReturnType<typeof mock>;
beforeEach(() => {
  fetchMock = mock();
  global.fetch = fetchMock as any;
});

import { exchangeCode, listPhoneNumbers, renewToken, MetaOAuthError } from "./meta-oauth.service";

const APP_ID = "app-id";
const APP_SECRET = "secret";

test("exchangeCode retorna long-lived token e expires_in", async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "short" }) } as any)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "long", expires_in: 5183944 }) } as any);
  const result = await exchangeCode("code", APP_ID, APP_SECRET);
  expect(result.access_token).toBe("long");
  expect(result.expires_in).toBe(5183944);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("exchangeCode lança MetaOAuthError quando code inválido", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Invalid code" } }) } as any);
  await expect(exchangeCode("bad", APP_ID, APP_SECRET)).rejects.toThrow(MetaOAuthError);
});

test("listPhoneNumbers retorna array de números", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: [{ id: "111", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" }] })
  } as any);
  const nums = await listPhoneNumbers("waba", "token");
  expect(nums).toHaveLength(1);
  expect(nums[0]).toEqual({ id: "111", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" });
});

test("listPhoneNumbers retorna array vazio", async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as any);
  expect(await listPhoneNumbers("waba", "token")).toHaveLength(0);
});

test("listPhoneNumbers lança MetaOAuthError em falha", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Invalid token" } }) } as any);
  await expect(listPhoneNumbers("waba", "bad")).rejects.toThrow(MetaOAuthError);
});

test("renewToken retorna novo token e expires_in", async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "renewed", expires_in: 5184000 }) } as any);
  const result = await renewToken("old", APP_ID, APP_SECRET);
  expect(result.access_token).toBe("renewed");
  expect(result.expires_in).toBe(5184000);
});

test("renewToken lança MetaOAuthError quando token expirado", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Session expired" } }) } as any);
  await expect(renewToken("expired", APP_ID, APP_SECRET)).rejects.toThrow(MetaOAuthError);
});
```

- [ ] **Step 2: Rodar — confirmar que falha**

```bash
bun test src/services/meta-oauth.service.test.ts
```

- [ ] **Step 3: Criar `src/services/meta-oauth.service.ts`**

```ts
const META_API = "https://graph.facebook.com/v21.0";

export class MetaOAuthError extends Error {
  constructor(public readonly metaMessage: string) {
    super(`Meta API error: ${metaMessage}`);
    this.name = "MetaOAuthError";
  }
}

export type TokenResult = { access_token: string; expires_in: number };
export type PhoneNumber = { id: string; display_phone_number: string; verified_name: string };

async function metaGet(url: string): Promise<any> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new MetaOAuthError(data?.error?.message ?? "Unknown error");
  return data;
}

/**
 * Troca o code do Embedded Signup por um long-lived token (~60 dias).
 * Faz duas chamadas GET à Meta Graph API (token exchange aceita query params via GET).
 */
export async function exchangeCode(code: string, appId: string, appSecret: string): Promise<TokenResult> {
  const shortUrl = `${META_API}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
  const short = await metaGet(shortUrl);

  const longUrl = `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(short.access_token)}`;
  const long = await metaGet(longUrl);
  return { access_token: long.access_token, expires_in: long.expires_in ?? 5184000 };
}

/** Lista os números de WhatsApp de um WABA. */
export async function listPhoneNumbers(wabaId: string, accessToken: string): Promise<PhoneNumber[]> {
  const url = `${META_API}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(accessToken)}`;
  const data = await metaGet(url);
  return data.data ?? [];
}

/** Renova um long-lived token. Usa expires_in da resposta para calcular novo prazo. */
export async function renewToken(currentToken: string, appId: string, appSecret: string): Promise<TokenResult> {
  const url = `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const data = await metaGet(url);
  return { access_token: data.access_token, expires_in: data.expires_in ?? 5184000 };
}
```

- [ ] **Step 4: Rodar testes**

```bash
bun test src/services/meta-oauth.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/meta-oauth.service.ts src/services/meta-oauth.service.test.ts
git commit -m "feat: meta-oauth.service — exchangeCode, listPhoneNumbers, renewToken"
```

---

### Task 3: HTML Pages — signup + success

**Files:**
- Create: `src/pages/signup-success.ts`
- Create: `src/pages/signup.ts`

Sem testes unitários — HTML puro, testado indiretamente pelo controller.

- [ ] **Step 1: Criar `src/pages/signup-success.ts`**

```ts
export function signupSuccessHTML(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Conectado — HaruCode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0fdf4; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; text-align: center; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h1 { font-size: 24px; color: #166534; margin-bottom: 12px; }
    p { color: #4b5563; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Tudo certo!</h1>
    <p>Seu WhatsApp Business foi conectado com sucesso.<br>Em breve nossa equipe entrará em contato.</p>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Criar `src/pages/signup.ts`**

A página usa o Facebook JS SDK para o Embedded Signup. O SDK dispara eventos `WA_EMBEDDED_SIGNUP` via `postMessage`.

```ts
function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function signupHTML(tokenId: string, metaAppId: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectar WhatsApp — HaruCode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    h1 { font-size: 22px; color: #1a1a2e; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; line-height: 1.5; }
    .btn-connect { width: 100%; padding: 14px; background: #25d366; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-connect:disabled { background: #9ca3af; cursor: not-allowed; }
    .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-top: 16px; display: none; }
    .error-msg.show { display: block; }
    #step-numbers { display: none; margin-top: 24px; }
    #step-numbers.show { display: block; }
    #step-numbers h2 { font-size: 16px; margin-bottom: 16px; }
    .number-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
    .number-item:hover { border-color: #4f46e5; }
    .number-item input[type="checkbox"] { width: 18px; height: 18px; }
    .number-name { font-size: 14px; font-weight: 600; color: #1a1a2e; }
    .number-phone { font-size: 13px; color: #6b7280; }
    .btn-confirm { width: 100%; margin-top: 16px; padding: 12px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn-confirm:disabled { background: #9ca3af; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>💬 Conectar WhatsApp Business</h1>
    <p class="subtitle">Clique no botão abaixo para autorizar a conexão do seu WhatsApp Business com a plataforma HaruCode.</p>
    <button class="btn-connect" id="btn-connect" onclick="launchSignup()">Conectar com WhatsApp Business</button>
    <div class="error-msg" id="error-msg"></div>
    <div id="step-numbers">
      <h2>Selecione os números a conectar:</h2>
      <div id="numbers-list"></div>
      <button class="btn-confirm" id="btn-confirm" onclick="confirmNumbers()">Confirmar seleção</button>
    </div>
  </div>

  <script>
    window.fbAsyncInit = function() {
      FB.init({ appId: '${escHtml(metaAppId)}', autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
    };
  </script>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>

  <script>
    var TOKEN_ID = '${escHtml(tokenId)}';

    function showError(msg) { var e = document.getElementById('error-msg'); e.textContent = msg; e.classList.add('show'); }
    function hideError() { document.getElementById('error-msg').classList.remove('show'); }

    function launchSignup() {
      hideError();
      document.getElementById('btn-connect').disabled = true;
      FB.login(function() {}, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        response_type: 'code',
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
      });
    }

    window.addEventListener('message', async function(event) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      var data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;

      if (data.event === 'CANCEL' || data.event === 'ERROR') {
        document.getElementById('btn-connect').disabled = false;
        showError('Autorização cancelada. Você pode tentar novamente.');
        return;
      }
      if (data.event === 'FINISH') {
        try {
          var res = await fetch('/signup/' + TOKEN_ID + '/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: data.data.code, waba_id: data.data.waba_id }),
          });
          var result = await res.json();
          if (!res.ok) {
            document.getElementById('btn-connect').disabled = false;
            showError(result.error || 'Algo deu errado. Recarregue e tente novamente.');
            return;
          }
          renderNumbers(result.numbers);
          document.getElementById('btn-connect').style.display = 'none';
          document.getElementById('step-numbers').classList.add('show');
        } catch {
          document.getElementById('btn-connect').disabled = false;
          showError('Algo deu errado. Recarregue e tente novamente.');
        }
      }
    });

    function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function renderNumbers(numbers) {
      document.getElementById('numbers-list').innerHTML = numbers.map(function(n, i) {
        return '<div class="number-item"><input type="checkbox" id="n'+i+'" value="'+esc(n.id)+'" checked>' +
          '<label for="n'+i+'"><div class="number-name">'+esc(n.verified_name)+'</div>' +
          '<div class="number-phone">'+esc(n.display_phone_number)+'</div></label></div>';
      }).join('');
    }

    async function confirmNumbers() {
      hideError();
      var ids = Array.from(document.querySelectorAll('#numbers-list input:checked')).map(function(cb) { return cb.value; });
      if (ids.length === 0) { showError('Selecione ao menos um número.'); return; }
      var btn = document.getElementById('btn-confirm');
      btn.disabled = true; btn.textContent = 'Aguarde...';
      try {
        var res = await fetch('/signup/' + TOKEN_ID + '/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number_ids: ids }),
        });
        var result = await res.json();
        if (!res.ok) { btn.disabled = false; btn.textContent = 'Confirmar seleção'; showError(result.error || 'Erro.'); return; }
        window.location.href = '/signup/success';
      } catch { btn.disabled = false; btn.textContent = 'Confirmar seleção'; showError('Erro ao confirmar.'); }
    }
  </script>
</body>
</html>`;
}

export function signupErrorHTML(message: string): string {
  const e = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Inválido — HaruCode</title>
  <style>* { margin:0;padding:0;box-sizing:border-box; } body { font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh; } .card { background:white;border-radius:16px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.07); } h1 { font-size:20px;color:#dc2626;margin-bottom:12px; } p { color:#4b5563;font-size:14px;line-height:1.6; }</style>
  </head><body><div class="card"><div style="font-size:48px;margin-bottom:20px">⚠️</div><h1>Link inválido</h1><p>${e(message)}</p></div></body></html>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/signup.ts src/pages/signup-success.ts
git commit -m "feat: páginas HTML signup (FB JS SDK) e sucesso do Embedded Signup"
```

---

### Task 4: signup.controller.ts

**Nota importante:** O `pending_meta_token` agora armazena JSON com `{ token, expires_at, numbers }`. O `/confirm` usa `numbers` para recuperar `verified_name` de cada número selecionado.

**Files:**
- Create: `src/controllers/signup.controller.ts`
- Create: `src/controllers/signup.controller.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/controllers/signup.controller.test.ts`:

```ts
import { test, expect, mock, beforeEach } from "bun:test";

const mockDb = {
  getSignupToken: mock(),
  setPendingToken: mock(),
  markTokenUsed: mock(),
  createClientsFromSignup: mock(),
};
const mockExchangeCode = mock();
const mockListPhoneNumbers = mock();
class MockMetaOAuthError extends Error { constructor(msg: string) { super(msg); this.name = "MetaOAuthError"; } }

mock.module("../services/db.service", () => ({ db: mockDb }));
mock.module("../services/meta-oauth.service", () => ({
  exchangeCode: mockExchangeCode, listPhoneNumbers: mockListPhoneNumbers,
  MetaOAuthError: MockMetaOAuthError,
}));
mock.module("../config/env", () => ({
  env: { META_APP_ID: "app-id", META_APP_SECRET: "secret", GATEWAY_PUBLIC_URL: "https://gw.test" },
}));

import { SignupController } from "./signup.controller";

beforeEach(() => {
  mockDb.getSignupToken.mockReset(); mockDb.setPendingToken.mockReset();
  mockDb.markTokenUsed.mockReset(); mockDb.createClientsFromSignup.mockReset();
  mockExchangeCode.mockReset(); mockListPhoneNumbers.mockReset();
});

// ─── showSignup ───────────────────────────────────────────────

test("showSignup retorna 200 com HTML quando token válido", async () => {
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: null });
  const res = SignupController.showSignup("tok-1");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("tok-1");
});

test("showSignup retorna 200 com página de erro quando token inválido", async () => {
  mockDb.getSignupToken.mockReturnValue(null);
  expect(await SignupController.showSignup("bad").text()).toContain("Link inválido");
});

// ─── exchangeCode ─────────────────────────────────────────────

test("exchangeCode retorna 200 com lista de números e salva pending token", async () => {
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: null });
  mockExchangeCode.mockResolvedValue({ access_token: "lt", expires_in: 5184000 });
  mockListPhoneNumbers.mockResolvedValue([
    { id: "p1", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" },
  ]);
  const req = new Request("http://x/signup/tok-1/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "fb-code", waba_id: "waba-1" }),
  });
  const res = await SignupController.exchangeCode(req, "tok-1");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.numbers).toHaveLength(1);
  // pending token deve conter o access_token e o array de números
  const savedPayload = JSON.parse(mockDb.setPendingToken.mock.calls[0][1]);
  expect(savedPayload.token).toBe("lt");
  expect(savedPayload.numbers).toHaveLength(1);
  expect(savedPayload.numbers[0].verified_name).toBe("Emp A");
});

test("exchangeCode retorna 400 quando token inválido", async () => {
  mockDb.getSignupToken.mockReturnValue(null);
  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "c", waba_id: "w" }) });
  expect((await SignupController.exchangeCode(req, "bad")).status).toBe(400);
});

test("exchangeCode retorna 400 quando Meta rejeita o code", async () => {
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: null });
  mockExchangeCode.mockRejectedValue(new MockMetaOAuthError("Invalid code"));
  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "bad", waba_id: "w" }) });
  expect((await SignupController.exchangeCode(req, "tok-1")).status).toBe(400);
});

test("exchangeCode é idempotente — sobrescreve pending token", async () => {
  const oldPayload = JSON.stringify({ token: "old", expires_at: "x", numbers: [] });
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: oldPayload });
  mockExchangeCode.mockResolvedValue({ access_token: "new", expires_in: 5184000 });
  mockListPhoneNumbers.mockResolvedValue([]);
  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "c2", waba_id: "w" }) });
  const res = await SignupController.exchangeCode(req, "tok-1");
  expect(res.status).toBe(200);
  const savedPayload = JSON.parse(mockDb.setPendingToken.mock.calls[0][1]);
  expect(savedPayload.token).toBe("new");
});

// ─── confirmNumbers ───────────────────────────────────────────

test("confirmNumbers cria clientes com verified_name e marca token como usado", async () => {
  const payload = JSON.stringify({
    token: "lt", expires_at: "2026-05-01 00:00:00",
    numbers: [
      { id: "p1", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" },
      { id: "p2", display_phone_number: "+55 11 9999-0002", verified_name: "Emp B" },
    ]
  });
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: payload });
  mockDb.createClientsFromSignup.mockReturnValue({ created: 2, skipped: 0 });

  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_ids: ["p1", "p2"] }) });
  const res = await SignupController.confirmNumbers(req, "tok-1");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.created).toBe(2);
  // Verifica que os verified_names foram passados para createClientsFromSignup
  const callArg = mockDb.createClientsFromSignup.mock.calls[0][0];
  expect(callArg[0].name).toBe("Emp A");
  expect(callArg[1].name).toBe("Emp B");
  expect(mockDb.markTokenUsed).toHaveBeenCalledWith("tok-1");
});

test("confirmNumbers retorna 400 sem pending_meta_token", async () => {
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: null });
  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_ids: ["p1"] }) });
  expect((await SignupController.confirmNumbers(req, "tok-1")).status).toBe(400);
});

test("confirmNumbers retorna 400 quando token inválido", async () => {
  mockDb.getSignupToken.mockReturnValue(null);
  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_ids: ["p1"] }) });
  expect((await SignupController.confirmNumbers(req, "bad")).status).toBe(400);
});

test("confirmNumbers com duplicata — sucesso parcial", async () => {
  const payload = JSON.stringify({
    token: "lt", expires_at: "2026-05-01 00:00:00",
    numbers: [{ id: "p1", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" }]
  });
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: payload });
  mockDb.createClientsFromSignup.mockReturnValue({ created: 0, skipped: 1 });

  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_ids: ["p1"] }) });
  const res = await SignupController.confirmNumbers(req, "tok-1");
  expect(res.status).toBe(200);
  expect((await res.json()).skipped).toBe(1);
  expect(mockDb.markTokenUsed).toHaveBeenCalled();
});

test("confirmNumbers com erro inesperado retorna 500 e não marca token como usado", async () => {
  const payload = JSON.stringify({
    token: "lt", expires_at: "2026-05-01 00:00:00",
    numbers: [{ id: "p1", display_phone_number: "+55 11 9999-0001", verified_name: "Emp A" }]
  });
  mockDb.getSignupToken.mockReturnValue({ id: "tok-1", pending_meta_token: payload });
  mockDb.createClientsFromSignup.mockImplementation(() => { throw new Error("DB locked"); });

  const req = new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_ids: ["p1"] }) });
  const res = await SignupController.confirmNumbers(req, "tok-1");
  expect(res.status).toBe(500);
  expect(mockDb.markTokenUsed).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar — confirmar que falha**

```bash
bun test src/controllers/signup.controller.test.ts
```

- [ ] **Step 3: Criar `src/controllers/signup.controller.ts`**

```ts
import { db } from "../services/db.service";
import { exchangeCode as metaExchangeCode, listPhoneNumbers, MetaOAuthError } from "../services/meta-oauth.service";
import type { PhoneNumber } from "../services/meta-oauth.service";
import { env } from "../config/env";
import { signupHTML, signupErrorHTML } from "../pages/signup";
import { signupSuccessHTML } from "../pages/signup-success";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

type PendingPayload = {
  token: string;
  expires_at: string;
  numbers: PhoneNumber[];
};

function expiresAtFromNow(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export class SignupController {
  static showSignup(tokenId: string): Response {
    const token = db.getSignupToken(tokenId);
    if (!token) {
      return html(signupErrorHTML("Este link não é válido ou já foi utilizado. Solicite um novo link à agência."));
    }
    return html(signupHTML(tokenId, env.META_APP_ID));
  }

  static showSuccess(): Response {
    return html(signupSuccessHTML());
  }

  static async exchangeCode(req: Request, tokenId: string): Promise<Response> {
    const token = db.getSignupToken(tokenId);
    if (!token) return json({ error: "Link inválido ou expirado." }, 400);

    let body: { code?: string; waba_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Requisição inválida." }, 400); }

    const { code, waba_id } = body;
    if (!code || !waba_id) return json({ error: "Parâmetros ausentes." }, 400);

    try {
      const { access_token, expires_in } = await metaExchangeCode(code, env.META_APP_ID, env.META_APP_SECRET);
      const numbers = await listPhoneNumbers(waba_id, access_token);

      // Armazena token + expires_at + números com verified_name (idempotente — sobrescreve se existia)
      const payload: PendingPayload = {
        token: access_token,
        expires_at: expiresAtFromNow(expires_in),
        numbers,
      };
      db.setPendingToken(tokenId, JSON.stringify(payload));

      return json({ numbers });
    } catch (err) {
      if (err instanceof MetaOAuthError) return json({ error: "Autorização expirada. Recarregue e tente novamente." }, 400);
      console.error("[signup] exchangeCode error:", err);
      return json({ error: "Erro interno. Tente novamente." }, 500);
    }
  }

  static async confirmNumbers(req: Request, tokenId: string): Promise<Response> {
    const token = db.getSignupToken(tokenId);
    if (!token) return json({ error: "Link inválido ou expirado." }, 400);
    if (!token.pending_meta_token) return json({ error: "Sessão inválida. Recomece o processo." }, 400);

    let pending: PendingPayload;
    try { pending = JSON.parse(token.pending_meta_token); }
    catch { return json({ error: "Sessão inválida. Recomece o processo." }, 400); }

    let body: { phone_number_ids?: string[] };
    try { body = await req.json(); } catch { return json({ error: "Requisição inválida." }, 400); }

    const { phone_number_ids } = body;
    if (!phone_number_ids || phone_number_ids.length === 0) return json({ error: "Selecione ao menos um número." }, 400);

    // Mapeia ids selecionados para objetos com verified_name
    const selectedNumbers = phone_number_ids.map(id => {
      const found = pending.numbers.find(n => n.id === id);
      return { phoneId: id, name: found?.verified_name ?? id, metaToken: pending.token, metaTokenExpiresAt: pending.expires_at };
    });

    try {
      const { created, skipped } = db.createClientsFromSignup(selectedNumbers);
      db.markTokenUsed(tokenId);
      return json({ success: true, created, skipped });
    } catch (err) {
      console.error("[signup] confirmNumbers unexpected error:", err);
      return json({ error: "Erro ao cadastrar. Tente novamente." }, 500);
    }
  }
}
```

- [ ] **Step 4: Rodar testes**

```bash
bun test src/controllers/signup.controller.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/controllers/signup.controller.ts src/controllers/signup.controller.test.ts
git commit -m "feat: signup.controller — troca de code, seleção de números, transação SQLite"
```

---

## Chunk 2: Integração (Routes + Admin + Job)

### Task 5: router.ts + env

**Files:**
- Modify: `src/routes/router.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Adicionar `META_APP_ID` ao `src/config/env.ts`**

```ts
META_APP_ID: process.env.META_APP_ID || '',
```

- [ ] **Step 2: Adicionar import e rotas em `src/routes/router.ts`**

Adicionar import:
```ts
import { SignupController } from '../controllers/signup.controller';
```

Adicionar bloco antes de `// ─── Admin`:
```ts
// ─── Signup (público — onboarding via Embedded Signup) ────────

if (method === "GET" && pathname === "/signup/success") {
  return SignupController.showSuccess();
}

const signupTokenMatch = pathname.match(/^\/signup\/([^/]+)$/);
if (method === "GET" && signupTokenMatch) {
  return SignupController.showSignup(signupTokenMatch[1]);
}

const signupExchangeMatch = pathname.match(/^\/signup\/([^/]+)\/exchange$/);
if (method === "POST" && signupExchangeMatch) {
  return await SignupController.exchangeCode(req, signupExchangeMatch[1]);
}

const signupConfirmMatch = pathname.match(/^\/signup\/([^/]+)\/confirm$/);
if (method === "POST" && signupConfirmMatch) {
  return await SignupController.confirmNumbers(req, signupConfirmMatch[1]);
}
```

- [ ] **Step 3: Adicionar ao `.env.example`**

```
META_APP_ID=          # ID do app Meta (público, usado no FB JS SDK do Embedded Signup)
```

- [ ] **Step 4: Rodar todos os testes**

```bash
bun test
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/router.ts src/config/env.ts .env.example
git commit -m "feat: rotas /signup/* + META_APP_ID no env"
```

---

### Task 6: Admin — gerar link + badge token expirado

**Files:**
- Modify: `src/controllers/admin.controller.ts`
- Modify: `src/pages/admin-dashboard.ts`
- Modify: `src/routes/router.ts`

- [ ] **Step 1: Adicionar `generateSignupLink` ao `AdminController`**

```ts
static generateSignupLink(): Response {
  const tokenId = db.addSignupToken();
  const url = `${env.GATEWAY_PUBLIC_URL}/signup/${tokenId}`;
  return new Response(null, {
    status: 302,
    headers: { Location: `/admin?signup_link=${encodeURIComponent(url)}` },
  });
}
```

- [ ] **Step 2: Atualizar `showDashboard` para ler `signup_link`**

```ts
const signupLinkParam = url.searchParams.get("signup_link");
return html(adminDashboardHTML(clients, message, undefined, signupLinkParam ?? undefined));
```

- [ ] **Step 3: Adicionar rota em `src/routes/router.ts`**

Dentro do bloco admin (após autenticação obrigatória):
```ts
if (method === "POST" && pathname === "/admin/signup-links") {
  return AdminController.generateSignupLink();
}
```

- [ ] **Step 4: Atualizar `src/pages/admin-dashboard.ts`**

**4a.** Atualizar assinatura:
```ts
export function adminDashboardHTML(
  clients: Client[],
  message?: { type: "success" | "error"; text: string },
  formValues?: FormValues,
  signupLink?: string
): string {
```

**4b.** Adicionar CSS (dentro do `<style>`):
```css
.badge-expired { background: #fee2e2; color: #dc2626; }
```

**4c.** Adicionar `<th>Token</th>` no thead, após `<th>Status</th>`.

**4d.** Adicionar célula de token nos rows, após status:
```ts
<td>${c.token_expired
  ? '<span class="badge badge-expired">Expirado</span>'
  : (c.meta_token_expires_at ? '<span class="status active">OK</span>' : '<span style="color:#9ca3af">—</span>')
}</td>
```

**4e.** Substituir o botão `+ Novo Cliente` por wrapper com dois botões:
```html
<div style="display:flex;gap:10px">
  <form method="POST" action="/admin/signup-links" style="display:inline">
    <button type="submit" class="btn-secondary">🔗 Gerar link de onboarding</button>
  </form>
  <button class="btn-primary" onclick="toggleForm()">+ Novo Cliente</button>
</div>
```

**4f.** Adicionar exibição do link após o banner de mensagem:
```ts
${signupLink ? `<div class="banner success" style="word-break:break-all">
  <strong>Link gerado (válido por 7 dias):</strong><br>
  <a href="${escHtml(signupLink)}" target="_blank">${escHtml(signupLink)}</a>
</div>` : ""}
```

- [ ] **Step 5: Rodar todos os testes**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/admin.controller.ts src/pages/admin-dashboard.ts src/routes/router.ts
git commit -m "feat: admin — gerar link de onboarding + badge token expirado"
```

---

### Task 7: token-refresh.job.ts + server.ts

**Files:**
- Create: `src/jobs/token-refresh.job.ts`
- Create: `src/jobs/token-refresh.job.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/jobs/token-refresh.job.test.ts`:

```ts
import { test, expect, mock, beforeEach } from "bun:test";

const mockGetExpiringTokens = mock();
const mockUpdateClientToken = mock();
const mockSetTokenExpired = mock();
const mockRenewToken = mock();

mock.module("../services/db.service", () => ({
  db: { getExpiringTokens: mockGetExpiringTokens, updateClientToken: mockUpdateClientToken, setTokenExpired: mockSetTokenExpired },
}));
mock.module("../services/meta-oauth.service", () => ({
  renewToken: mockRenewToken, MetaOAuthError: class extends Error {},
}));
mock.module("../config/env", () => ({ env: { META_APP_ID: "app-id", META_APP_SECRET: "secret" } }));

import { runTokenRefreshJob } from "./token-refresh.job";

beforeEach(() => {
  mockGetExpiringTokens.mockReset(); mockUpdateClientToken.mockReset();
  mockSetTokenExpired.mockReset(); mockRenewToken.mockReset();
});

test("renova tokens dentro do threshold", async () => {
  mockGetExpiringTokens.mockReturnValue([{ id: "c1", meta_token: "old-1" }, { id: "c2", meta_token: "old-2" }]);
  mockRenewToken
    .mockResolvedValueOnce({ access_token: "new-1", expires_in: 5184000 })
    .mockResolvedValueOnce({ access_token: "new-2", expires_in: 5184000 });
  await runTokenRefreshJob();
  expect(mockUpdateClientToken).toHaveBeenCalledTimes(2);
  expect(mockUpdateClientToken).toHaveBeenCalledWith("c1", "new-1", expect.any(String));
  expect(mockSetTokenExpired).not.toHaveBeenCalled();
});

test("não faz nada quando não há tokens expirando", async () => {
  mockGetExpiringTokens.mockReturnValue([]);
  await runTokenRefreshJob();
  expect(mockRenewToken).not.toHaveBeenCalled();
});

test("seta token_expired e continua para os demais quando renovação falha", async () => {
  mockGetExpiringTokens.mockReturnValue([{ id: "c1", meta_token: "bad" }, { id: "c2", meta_token: "good" }]);
  mockRenewToken
    .mockRejectedValueOnce(new Error("expired"))
    .mockResolvedValueOnce({ access_token: "new-2", expires_in: 5184000 });
  await runTokenRefreshJob();
  expect(mockSetTokenExpired).toHaveBeenCalledWith("c1", 1);
  expect(mockUpdateClientToken).toHaveBeenCalledWith("c2", "new-2", expect.any(String));
});

test("não lança quando todos falham", async () => {
  mockGetExpiringTokens.mockReturnValue([{ id: "c1", meta_token: "bad" }, { id: "c2", meta_token: "bad" }]);
  mockRenewToken.mockRejectedValue(new Error("fail"));
  await expect(runTokenRefreshJob()).resolves.not.toThrow();
  expect(mockSetTokenExpired).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Rodar — confirmar que falha**

```bash
bun test src/jobs/token-refresh.job.test.ts
```

- [ ] **Step 3: Criar `src/jobs/token-refresh.job.ts`**

```ts
import { db } from "../services/db.service";
import { renewToken } from "../services/meta-oauth.service";
import { env } from "../config/env";

const THRESHOLD_DAYS = 7;

function expiresAtFromNow(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export async function runTokenRefreshJob(): Promise<void> {
  const clients = db.getExpiringTokens(THRESHOLD_DAYS);
  if (clients.length === 0) {
    console.log("[token-refresh] Nenhum token expirando nos próximos", THRESHOLD_DAYS, "dias.");
    return;
  }
  console.log(`[token-refresh] Renovando ${clients.length} token(s)...`);
  for (const client of clients) {
    try {
      const { access_token, expires_in } = await renewToken(client.meta_token, env.META_APP_ID, env.META_APP_SECRET);
      db.updateClientToken(client.id, access_token, expiresAtFromNow(expires_in));
      console.log(`[token-refresh] ✅ Cliente ${client.id} renovado.`);
    } catch (err) {
      console.error(`[token-refresh] ❌ Falha ao renovar cliente ${client.id}:`, err);
      db.setTokenExpired(client.id, 1);
    }
  }
}

export function scheduleTokenRefreshJob(): void {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

  setTimeout(() => {
    runTokenRefreshJob().catch(err => console.error("[token-refresh] Erro:", err));
    setInterval(
      () => runTokenRefreshJob().catch(err => console.error("[token-refresh] Erro:", err)),
      24 * 60 * 60 * 1000
    );
  }, next3am.getTime() - now.getTime());

  console.log(`[token-refresh] Job agendado para ${next3am.toISOString()}`);
}
```

- [ ] **Step 4: Rodar testes**

```bash
bun test src/jobs/token-refresh.job.test.ts
```

- [ ] **Step 5: Atualizar `src/server.ts`**

```ts
import { appRouter } from './routes/router';
import { env } from './config/env';
import { scheduleTokenRefreshJob } from './jobs/token-refresh.job';

const server = Bun.serve({
  port: env.PORT,
  fetch: appRouter,
});

console.log(`🚀 [wa-omni-gateway] rodando perfeitamente em http://localhost:${server.port}`);
console.log(`📡 Rota de Webhook aguardando em http://localhost:${server.port}/webhook`);

scheduleTokenRefreshJob();
```

- [ ] **Step 6: Rodar suite completa**

```bash
bun test
```
Esperado: todos passando, zero falhas.

- [ ] **Step 7: Commit**

```bash
git add src/jobs/token-refresh.job.ts src/jobs/token-refresh.job.test.ts src/server.ts
git commit -m "feat: token-refresh job diário — renova meta_tokens antes do vencimento"
```

---

## Verificação Final

- [ ] **Suite completa**

```bash
bun test
```
Esperado: todos passando.

- [ ] **Verificar TypeScript**

```bash
bun build src/server.ts --target=bun --outdir=/tmp/dist-check 2>&1 | head -30
```
Esperado: sem erros de tipo.

---

## Notas de Deploy

Após merge e deploy automático via GitHub Actions:

1. Adicionar ao `.env` no servidor DigitalOcean:
   ```
   META_APP_ID=<ID do app no Meta Developers>
   ```

2. No Meta Developers Console → seu app → Facebook Login → Valid OAuth Redirect URIs:
   ```
   https://gateway.harucode.com.br/signup/fbcallback
   ```
