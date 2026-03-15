# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel admin interno em `/admin` para cadastrar, visualizar, desativar e reativar clientes do gateway sem usar curl/Postman.

**Architecture:** Três novos arquivos (controller, página login, página dashboard) seguindo o padrão existente de `src/pages/*.ts`. Autenticação via cookie HMAC-SHA256. Toda persistência chama `db` diretamente — sem HTTP loopback.

**Tech Stack:** Bun, TypeScript, HTML/CSS/JS vanilla server-side, `bun:sqlite` (já em uso), `crypto` nativo do Node/Bun.

**Spec:** `docs/superpowers/specs/2026-03-14-admin-dashboard-design.md`

---

## Chunk 1: Fundação — Variável de Ambiente + Utilitários de Sessão

### Task 1: Adicionar `ADMIN_PASSWORD` ao env e ao `.env.example`

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Adicionar `ADMIN_PASSWORD` em `src/config/env.ts`**

Abra o arquivo. O padrão atual é `CHAVE: process.env.CHAVE || ''`. Para `ADMIN_PASSWORD`, o valor deve ser `undefined` quando não definido (não `''`), pois a ausência é detectada explicitamente:

```ts
// No objeto `env`, adicionar após GATEWAY_PUBLIC_URL:
ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
```

O tipo de `ADMIN_PASSWORD` será `string | undefined` automaticamente.

- [ ] **Step 2: Adicionar ao `.env.example`**

No final do arquivo `.env.example`, adicionar:

```
# Admin Dashboard
# Defina uma senha forte para acessar /admin
ADMIN_PASSWORD=
```

- [ ] **Step 3: Commit**

```bash
git add src/config/env.ts .env.example
git commit -m "feat: adiciona ADMIN_PASSWORD ao env"
```

---

### Task 2: Utilitários de sessão com testes

**Files:**
- Create: `src/utils/session.ts`
- Create: `src/utils/session.test.ts`

Os utilitários de sessão são funções puras — testáveis sem servidor.

- [ ] **Step 1: Criar o arquivo de testes `src/utils/session.test.ts`**

```ts
import { test, expect, describe } from "bun:test";
import { generateSessionToken, verifySessionToken } from "./session";

describe("generateSessionToken", () => {
  test("retorna string no formato payload.mac", () => {
    const token = generateSessionToken("minha-senha");
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    // payload é base64url de timestamp
    expect(parts[0].length).toBeGreaterThan(0);
    // mac é hex de 64 chars (sha256)
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  test("tokens diferentes em chamadas distintas (timestamp avança)", async () => {
    const t1 = generateSessionToken("senha");
    await Bun.sleep(1100); // garante timestamp diferente (resolução em segundos)
    const t2 = generateSessionToken("senha");
    expect(t1).not.toBe(t2);
  });
});

describe("verifySessionToken", () => {
  test("aceita token válido recém-gerado", () => {
    const password = "senha-segura";
    const token = generateSessionToken(password);
    const result = verifySessionToken(token, password);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
  });

  test("rejeita token com senha errada", () => {
    const token = generateSessionToken("senha-certa");
    const result = verifySessionToken(token, "senha-errada");
    expect(result.valid).toBe(false);
  });

  test("rejeita token malformado", () => {
    expect(verifySessionToken("nao-tem-ponto", "senha").valid).toBe(false);
    expect(verifySessionToken("", "senha").valid).toBe(false);
    expect(verifySessionToken("a.b.c", "senha").valid).toBe(false);
  });

  test("rejeita token expirado (> 8h)", () => {
    const password = "senha";
    // Simula timestamp de 9 horas atrás
    const nineHoursAgo = Math.floor(Date.now() / 1000) - 9 * 3600;
    const { createHmac } = await import("crypto");
    const payload = Buffer.from(String(nineHoursAgo)).toString("base64url");
    const mac = createHmac("sha256", password).update(payload).digest("hex");
    const expiredToken = `${payload}.${mac}`;

    const result = verifySessionToken(expiredToken, password);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar os testes — devem FALHAR**

```bash
bun test src/utils/session.test.ts
```

Esperado: erro "Cannot find module './session'"

- [ ] **Step 3: Implementar `src/utils/session.ts`**

```ts
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_SECONDS = 8 * 3600; // 8 horas

export function generateSessionToken(password: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(String(timestamp)).toString("base64url");
  const mac = createHmac("sha256", password).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifySessionToken(
  token: string,
  password: string
): { valid: boolean; expired: boolean } {
  const invalid = { valid: false, expired: false };
  const expired = { valid: false, expired: true };

  const parts = token?.split(".");
  if (!parts || parts.length !== 2) return invalid;

  const [payload, mac] = parts;
  if (!payload || !mac) return invalid;

  // Verifica MAC
  const expectedMac = createHmac("sha256", password).update(payload).digest("hex");
  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");

  if (macBuf.length !== expectedBuf.length) return invalid;
  if (!timingSafeEqual(macBuf, expectedBuf)) return invalid;

  // Verifica expiração
  const timestamp = parseInt(Buffer.from(payload, "base64url").toString(), 10);
  if (isNaN(timestamp)) return invalid;

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (ageSeconds > SESSION_TTL_SECONDS) return expired;

  return { valid: true, expired: false };
}
```

- [ ] **Step 4: Rodar os testes — devem PASSAR**

```bash
bun test src/utils/session.test.ts
```

Esperado: todos os testes passando (exceto o de timestamps diferentes que pode ser flaky em CI — aceitável).

- [ ] **Step 5: Commit**

```bash
git add src/utils/session.ts src/utils/session.test.ts
git commit -m "feat: utilitários de sessão HMAC para admin"
```

---

## Chunk 2: Páginas HTML

### Task 3: Página de Login

**Files:**
- Create: `src/pages/admin-login.ts`

Segue o padrão de `src/pages/privacy.ts` — exporta função que retorna string HTML.

- [ ] **Step 1: Criar `src/pages/admin-login.ts`**

```ts
export function adminLoginHTML(error?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — HaruCode Gateway</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    }
    h1 { font-size: 22px; color: #1a1a2e; margin-bottom: 6px; }
    p { color: #666; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px; }
    input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus { border-color: #4f46e5; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    button {
      width: 100%;
      margin-top: 16px;
      padding: 11px;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 HaruCode Admin</h1>
    <p>Painel interno de gestão do gateway.</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/admin/login">
      <label for="password">Senha</label>
      <input type="password" id="password" name="password" autofocus required placeholder="••••••••">
      <button type="submit">Entrar</button>
    </form>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin-login.ts
git commit -m "feat: página HTML de login do admin"
```

---

### Task 4: Página de Dashboard

**Files:**
- Create: `src/pages/admin-dashboard.ts`

Esta página recebe a lista de clientes e uma mensagem opcional (erro ou sucesso).

- [ ] **Step 1: Criar `src/pages/admin-dashboard.ts`**

A função aceita `formValues` opcionais para pré-preencher o formulário quando há erro de validação (critério 9 da spec).

```ts
import type { Client } from "../services/db.service";

export type FormValues = {
  name?: string;
  client_type?: string;
  phone_number_id?: string;
  meta_token?: string;
  ghl_location_id?: string;
  webhook_url?: string;
};

export function adminDashboardHTML(
  clients: Client[],
  message?: { type: "success" | "error"; text: string },
  formValues?: FormValues
): string {
  const fv = formValues || {};
  const isWebhook = fv.client_type === "webhook";
  const rows = clients.map(c => `
    <tr>
      <td>${escHtml(c.name)}</td>
      <td><span class="badge badge-${c.client_type}">${c.client_type.toUpperCase()}</span></td>
      <td><code>${escHtml(c.phone_number_id)}</code></td>
      <td><span class="status ${c.active ? 'active' : 'inactive'}">${c.active ? 'ativo' : 'inativo'}</span></td>
      <td>
        ${c.active
          ? `<form method="POST" action="/admin/clients/${c.id}/deactivate" style="display:inline">
               <button type="submit" class="btn-danger" onclick="return confirm('Desativar ${escHtml(c.name)}?')">Desativar</button>
             </form>`
          : `<form method="POST" action="/admin/clients/${c.id}/reactivate" style="display:inline">
               <button type="submit" class="btn-secondary">Reativar</button>
             </form>`
        }
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — HaruCode Gateway</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a2e; }
    header { background: #4f46e5; color: white; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 18px; font-weight: 700; }
    header form button { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    header form button:hover { background: rgba(255,255,255,0.25); }
    main { max-width: 1100px; margin: 32px auto; padding: 0 24px; }
    .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; font-weight: 500; }
    .banner.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .banner.error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .section-header h2 { font-size: 18px; }
    table { width: 100%; background: white; border-radius: 10px; border-collapse: collapse; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden; }
    th { background: #f9fafb; text-align: left; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .badge-ghl { background: #dbeafe; color: #1d4ed8; }
    .badge-webhook { background: #f3e8ff; color: #7c3aed; }
    .status { font-size: 13px; font-weight: 600; }
    .status.active { color: #16a34a; }
    .status.inactive { color: #9ca3af; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .btn-danger { background: #fee2e2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-danger:hover { background: #fecaca; }
    .btn-secondary { background: #e5e7eb; color: #374151; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-primary { background: #4f46e5; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .btn-primary:hover { background: #4338ca; }

    /* Formulário novo cliente */
    #form-novo-cliente { display: none; background: white; border-radius: 10px; padding: 28px; margin-top: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    #form-novo-cliente.open { display: block; }
    #form-novo-cliente h3 { font-size: 16px; margin-bottom: 20px; }
    .form-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full { grid-column: 1 / -1; }
    .form-group label { font-size: 13px; font-weight: 600; color: #374151; }
    .form-group input, .form-group select {
      padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 14px; outline: none; transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group select:focus { border-color: #4f46e5; }
    .form-error { color: #dc2626; font-size: 12px; margin-top: 2px; }
    .form-actions { grid-column: 1 / -1; display: flex; gap: 12px; margin-top: 8px; }

    /* Guia Meta */
    #guia-meta { margin-top: 24px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; overflow: hidden; }
    #guia-meta summary { padding: 14px 20px; cursor: pointer; font-size: 14px; font-weight: 600; color: #92400e; user-select: none; }
    #guia-meta summary:hover { background: #fef3c7; }
    .guia-content { padding: 0 20px 20px; }
    .guia-content h4 { font-size: 13px; font-weight: 700; color: #78350f; margin: 16px 0 8px; }
    .guia-content ol { padding-left: 20px; }
    .guia-content li { font-size: 13px; color: #713f12; line-height: 1.8; }
  </style>
</head>
<body>
  <header>
    <h1>🔧 HaruCode Gateway Admin</h1>
    <form method="POST" action="/admin/logout">
      <button type="submit">Sair</button>
    </form>
  </header>

  <main>
    ${message ? `<div class="banner ${message.type}">${escHtml(message.text)}</div>` : ""}

    <div class="section-header">
      <h2>Clientes (${clients.length})</h2>
      <button class="btn-primary" onclick="toggleForm()">+ Novo Cliente</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Tipo</th>
          <th>Phone Number ID</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:32px">Nenhum cliente cadastrado ainda.</td></tr>'}
      </tbody>
    </table>

    <div id="form-novo-cliente" ${formValues ? 'class="open"' : ''}>
      <h3>Novo Cliente</h3>
      <form method="POST" action="/admin/clients">
        <div class="form-layout">
          <div class="form-group">
            <label for="name">Nome *</label>
            <input type="text" id="name" name="name" required placeholder="Ex: Empresa X" value="${escHtml(fv.name || '')}">
          </div>
          <div class="form-group">
            <label for="client_type">Tipo *</label>
            <select id="client_type" name="client_type" onchange="onTypeChange(this.value)" required>
              <option value="ghl" ${!isWebhook ? 'selected' : ''}>GHL (GoHighLevel)</option>
              <option value="webhook" ${isWebhook ? 'selected' : ''}>Webhook (n8n, bot, etc)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="phone_number_id">Phone Number ID *</label>
            <input type="text" id="phone_number_id" name="phone_number_id" required placeholder="Ex: 123456789012345" value="${escHtml(fv.phone_number_id || '')}">
          </div>
          <div class="form-group">
            <label for="meta_token">Meta Token (System User) *</label>
            <input type="text" id="meta_token" name="meta_token" required placeholder="EAAxxxxxx..." value="${escHtml(fv.meta_token || '')}">
          </div>
          <div class="form-group" id="field-ghl-location" ${isWebhook ? 'style="display:none"' : ''}>
            <label for="ghl_location_id">GHL Location ID *</label>
            <input type="text" id="ghl_location_id" name="ghl_location_id" placeholder="Ex: AbCdEfGhIj..." value="${escHtml(fv.ghl_location_id || '')}">
          </div>
          <div class="form-group" id="field-webhook-url" ${!isWebhook ? 'style="display:none"' : ''}>
            <label for="webhook_url">Webhook URL *</label>
            <input type="url" id="webhook_url" name="webhook_url" placeholder="https://..." value="${escHtml(fv.webhook_url || '')}">
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Cadastrar</button>
            <button type="button" class="btn-secondary" onclick="toggleForm()">Cancelar</button>
          </div>
        </div>
      </form>
    </div>

    <details id="guia-meta">
      <summary>📖 Guia: onde encontrar os dados no Meta</summary>
      <div class="guia-content">
        <h4>Como obter o Phone Number ID</h4>
        <ol>
          <li>Acesse <a href="https://developers.facebook.com" target="_blank">developers.facebook.com</a> → seu app</li>
          <li>Menu lateral: <strong>WhatsApp → API Setup</strong></li>
          <li>Na seção "From", selecione o número — o Phone Number ID aparece abaixo</li>
        </ol>
        <h4>Como gerar o Meta Token (System User)</h4>
        <ol>
          <li>Acesse <a href="https://business.facebook.com" target="_blank">business.facebook.com</a> → Configurações do Negócio</li>
          <li>Usuários → <strong>Usuários do Sistema</strong> → criar ou selecionar um usuário admin</li>
          <li>Clique em <strong>"Gerar novo token"</strong> → selecione seu app</li>
          <li>Permissões necessárias: <code>whatsapp_business_management</code> e <code>whatsapp_business_messaging</code></li>
          <li>Copie o token gerado — <strong>ele não é exibido novamente</strong></li>
        </ol>
      </div>
    </details>
  </main>

  <script>
    function toggleForm() {
      const form = document.getElementById('form-novo-cliente');
      form.classList.toggle('open');
    }
    function onTypeChange(value) {
      document.getElementById('field-ghl-location').style.display = value === 'ghl' ? '' : 'none';
      document.getElementById('field-webhook-url').style.display = value === 'webhook' ? '' : 'none';
      document.getElementById('ghl_location_id').required = value === 'ghl';
      document.getElementById('webhook_url').required = value === 'webhook';
    }
  </script>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin-dashboard.ts
git commit -m "feat: página HTML do dashboard admin"
```

---

## Chunk 3: Controller

### Task 5: AdminController com testes de validação

**Files:**
- Create: `src/controllers/admin.controller.ts`
- Create: `src/controllers/admin.controller.test.ts`

O controller tem lógica de validação que é testável de forma isolada.

- [ ] **Step 1: Criar `src/controllers/admin.controller.test.ts`**

```ts
import { test, expect, describe } from "bun:test";
import { validateClientInput } from "./admin.controller";

describe("validateClientInput", () => {
  const base = {
    name: "Cliente A",
    client_type: "ghl",
    phone_number_id: "123456789",
    meta_token: "EAAxxxxx",
    ghl_location_id: "loc123",
    webhook_url: "",
  };

  test("aceita cliente GHL válido", () => {
    const result = validateClientInput(base);
    expect(result.errors).toEqual([]);
    expect(result.data?.webhook_url).toBe("");
    expect(result.data?.ghl_location_id).toBe("loc123");
  });

  test("aceita cliente Webhook válido", () => {
    const input = { ...base, client_type: "webhook", webhook_url: "https://n8n.com/hook", ghl_location_id: "" };
    const result = validateClientInput(input);
    expect(result.errors).toEqual([]);
    expect(result.data?.ghl_location_id).toBeNull();
    expect(result.data?.webhook_url).toBe("https://n8n.com/hook");
  });

  test("rejeita nome ausente", () => {
    const result = validateClientInput({ ...base, name: "" });
    expect(result.errors.some(e => e.includes("nome"))).toBe(true);
  });

  test("rejeita phone_number_id ausente", () => {
    const result = validateClientInput({ ...base, phone_number_id: "" });
    expect(result.errors.some(e => e.includes("Phone Number ID"))).toBe(true);
  });

  test("rejeita meta_token ausente", () => {
    const result = validateClientInput({ ...base, meta_token: "" });
    expect(result.errors.some(e => e.includes("Meta Token"))).toBe(true);
  });

  test("rejeita GHL sem ghl_location_id", () => {
    const result = validateClientInput({ ...base, ghl_location_id: "" });
    expect(result.errors.some(e => e.includes("GHL Location ID"))).toBe(true);
  });

  test("rejeita Webhook sem webhook_url", () => {
    const input = { ...base, client_type: "webhook", webhook_url: "", ghl_location_id: "" };
    const result = validateClientInput(input);
    expect(result.errors.some(e => e.includes("Webhook URL"))).toBe(true);
  });

  test("ignora ghl_location_id extra quando tipo é webhook", () => {
    const input = { ...base, client_type: "webhook", webhook_url: "https://x.com", ghl_location_id: "qualquer" };
    const result = validateClientInput(input);
    expect(result.errors).toEqual([]);
    expect(result.data?.ghl_location_id).toBeNull(); // ignorado
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

```bash
bun test src/controllers/admin.controller.test.ts
```

Esperado: erro "Cannot find module"

- [ ] **Step 3: Criar `src/controllers/admin.controller.ts`**

```ts
import { createHmac } from "crypto";
import { env } from "../config/env";
import { db } from "../services/db.service";
import type { Client, ClientType } from "../services/db.service";
import { generateSessionToken, verifySessionToken } from "../utils/session";
import { adminLoginHTML } from "../pages/admin-login";
import { adminDashboardHTML, type FormValues } from "../pages/admin-dashboard";

// ─── Validação ──────────────────────────────────────────────

type FormInput = {
  name: string;
  client_type: string;
  phone_number_id: string;
  meta_token: string;
  ghl_location_id: string;
  webhook_url: string;
};

type ValidationResult =
  | { errors: string[]; data: null }
  | { errors: []; data: { name: string; client_type: ClientType; phone_number_id: string; meta_token: string; ghl_location_id: string | null; webhook_url: string } };

export function validateClientInput(input: FormInput): ValidationResult {
  const errors: string[] = [];

  if (!input.name?.trim()) errors.push("Campo nome é obrigatório");
  if (!input.phone_number_id?.trim()) errors.push("Campo Phone Number ID é obrigatório");
  if (!input.meta_token?.trim()) errors.push("Campo Meta Token é obrigatório");

  const type = input.client_type === "ghl" || input.client_type === "webhook"
    ? input.client_type
    : null;
  if (!type) errors.push("Tipo inválido");

  if (type === "ghl" && !input.ghl_location_id?.trim()) {
    errors.push("Campo GHL Location ID é obrigatório para clientes GHL");
  }
  if (type === "webhook" && !input.webhook_url?.trim()) {
    errors.push("Campo Webhook URL é obrigatório para clientes Webhook");
  }

  if (errors.length > 0) return { errors, data: null };

  return {
    errors: [],
    data: {
      name: input.name.trim(),
      client_type: type!,
      phone_number_id: input.phone_number_id.trim(),
      meta_token: input.meta_token.trim(),
      ghl_location_id: type === "ghl" ? input.ghl_location_id.trim() : null,
      webhook_url: type === "webhook" ? input.webhook_url.trim() : "",
    },
  };
}

// ─── Helpers de Response ────────────────────────────────────

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } });

const SESSION_COOKIE = "admin_session";

function setSessionCookie(password: string): string {
  const token = generateSessionToken(password);
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=${8 * 3600}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0`;
}

function getSessionFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

export function isAuthenticated(req: Request): boolean {
  const password = env.ADMIN_PASSWORD;
  if (!password) return false;
  const token = getSessionFromRequest(req);
  if (!token) return false;
  return verifySessionToken(token, password).valid;
}

// ─── Handlers ───────────────────────────────────────────────

export class AdminController {
  static showLogin(error?: string): Response {
    return html(adminLoginHTML(error));
  }

  static async handleLogin(req: Request): Promise<Response> {
    const password = env.ADMIN_PASSWORD!;
    const form = await req.formData();
    const submitted = form.get("password") as string;

    if (submitted !== password) {
      return html(adminLoginHTML("Senha incorreta."));
    }

    const cookie = setSessionCookie(password);
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin", "Set-Cookie": cookie },
    });
  }

  static handleLogout(): Response {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/login", "Set-Cookie": clearSessionCookie() },
    });
  }

  static showDashboard(url: URL): Response {
    const clients = db.getAllClients();
    const successParam = url.searchParams.get("success");
    const errorParam = url.searchParams.get("error");

    let message: { type: "success" | "error"; text: string } | undefined;
    if (successParam === "1") message = { type: "success", text: "Cliente cadastrado com sucesso!" };
    if (errorParam) message = { type: "error", text: decodeURIComponent(errorParam) };

    return html(adminDashboardHTML(clients, message));
  }

  static async createClient(req: Request): Promise<Response> {
    const form = await req.formData();
    const input: FormInput = {
      name: (form.get("name") as string) || "",
      client_type: (form.get("client_type") as string) || "",
      phone_number_id: (form.get("phone_number_id") as string) || "",
      meta_token: (form.get("meta_token") as string) || "",
      ghl_location_id: (form.get("ghl_location_id") as string) || "",
      webhook_url: (form.get("webhook_url") as string) || "",
    };

    // formValues para preservar dados preenchidos no formulário em caso de erro
    const formValues: FormValues = {
      name: input.name,
      client_type: input.client_type,
      phone_number_id: input.phone_number_id,
      meta_token: input.meta_token,
      ghl_location_id: input.ghl_location_id,
      webhook_url: input.webhook_url,
    };

    const validation = validateClientInput(input);
    if (validation.errors.length > 0) {
      const clients = db.getAllClients();
      const errorMsg = validation.errors.join(" | ");
      return html(adminDashboardHTML(clients, { type: "error", text: errorMsg }, formValues));
    }

    try {
      db.createClient(validation.data!);
      return redirect("/admin?success=1");
    } catch (err: any) {
      const isUnique = err?.message?.includes("UNIQUE");
      const errorMsg = isUnique
        ? "Este Phone Number ID já está cadastrado"
        : "Erro ao cadastrar cliente — tente novamente";
      const clients = db.getAllClients();
      return html(adminDashboardHTML(clients, { type: "error", text: errorMsg }, formValues));
    }
  }

  static deactivateClient(id: string): Response {
    const ok = db.deleteClient(id);
    if (!ok) {
      const clients = db.getAllClients();
      return html(adminDashboardHTML(clients, { type: "error", text: "Cliente não encontrado" }));
    }
    return redirect("/admin");
  }

  static reactivateClient(id: string): Response {
    const updated = db.updateClient(id, { active: 1 });
    if (!updated) {
      const clients = db.getAllClients();
      return html(adminDashboardHTML(clients, { type: "error", text: "Cliente não encontrado" }));
    }
    return redirect("/admin");
  }
}
```

- [ ] **Step 4: Rodar os testes — devem PASSAR**

```bash
bun test src/controllers/admin.controller.test.ts
```

Esperado: todos os testes de validação passando.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/admin.controller.ts src/controllers/admin.controller.test.ts
git commit -m "feat: AdminController com validação e handlers"
```

---

## Chunk 4: Roteamento e Integração Final

### Task 6: Conectar as rotas no router

**Files:**
- Modify: `src/routes/router.ts`

- [ ] **Step 1: Adicionar imports no topo de `src/routes/router.ts`**

Logo após os imports existentes, adicionar:

```ts
import { AdminController, isAuthenticated } from '../controllers/admin.controller';
```

- [ ] **Step 2: Adicionar bloco `/admin/*` antes do bloco `/api/`**

No corpo do `appRouter`, localizar a linha `if (pathname.startsWith("/api/"))` e inserir o bloco do admin **antes** dela:

```ts
// ─── Admin (protegido por senha) ─────────────────────────

if (pathname.startsWith("/admin")) {
  // 503 se ADMIN_PASSWORD não configurado
  if (!env.ADMIN_PASSWORD) {
    return new Response("Admin não configurado", { status: 503 });
  }

  // Rotas públicas (sem autenticação)
  if (method === "GET" && pathname === "/admin/login") {
    return AdminController.showLogin();
  }
  if (method === "POST" && pathname === "/admin/login") {
    return await AdminController.handleLogin(req);
  }
  if (method === "POST" && pathname === "/admin/logout") {
    return AdminController.handleLogout();
  }

  // Redireciona /admin para /admin/login se sem sessão
  if (method === "GET" && pathname === "/admin") {
    if (!isAuthenticated(req)) return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
    return AdminController.showDashboard(url);
  }

  // A partir daqui, sessão obrigatória
  if (!isAuthenticated(req)) {
    return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
  }

  if (method === "POST" && pathname === "/admin/clients") {
    return await AdminController.createClient(req);
  }

  // POST /admin/clients/:id/deactivate
  const deactivateMatch = pathname.match(/^\/admin\/clients\/([^/]+)\/deactivate$/);
  if (method === "POST" && deactivateMatch) {
    return AdminController.deactivateClient(deactivateMatch[1]);
  }

  // POST /admin/clients/:id/reactivate
  const reactivateMatch = pathname.match(/^\/admin\/clients\/([^/]+)\/reactivate$/);
  if (method === "POST" && reactivateMatch) {
    return AdminController.reactivateClient(reactivateMatch[1]);
  }

  return new Response("Not Found", { status: 404 });
}
```

- [ ] **Step 3: Rodar o servidor localmente para testar manualmente**

```bash
# Adicione ADMIN_PASSWORD ao .env local (só para teste)
echo "ADMIN_PASSWORD=teste123" >> .env

bun --hot src/server.ts
```

Abra `http://localhost:3000/admin` no browser. Deve redirecionar para `/admin/login`.

- [ ] **Step 4: Verificar fluxo completo manualmente**

Checklist:
- [ ] `/admin` sem sessão → redireciona para `/admin/login`
- [ ] Login com senha errada → exibe "Senha incorreta"
- [ ] Login com senha certa → vai para `/admin` com tabela de clientes
- [ ] Botão "+ Novo Cliente" → abre o formulário inline
- [ ] Mudar tipo para "Webhook" → GHL Location ID some, Webhook URL aparece
- [ ] Cadastrar cliente GHL → cliente aparece na tabela, banner de sucesso
- [ ] Cadastrar cliente Webhook → funciona igualmente
- [ ] Tentar cadastrar com Phone Number ID duplicado → mensagem de erro inline
- [ ] Desativar cliente → aparece confirmação, cliente fica inativo
- [ ] Reativar cliente → cliente volta a ativo
- [ ] Guia Meta → clicável, abre/fecha, mostra instruções completas
- [ ] Botão "Sair" → limpa sessão, volta para login

- [ ] **Step 5: Commit final**

```bash
git add src/routes/router.ts
git commit -m "feat: rotas /admin integradas ao gateway"
```

---

### Task 7: Adicionar ADMIN_PASSWORD no servidor de produção

Esta task é **manual** — feita via SSH no DigitalOcean. Não tem código.

- [ ] **Step 1: SSH no servidor**

```bash
ssh root@<IP_DO_SERVIDOR>
```

- [ ] **Step 2: Editar o `.env` do gateway**

```bash
cd /var/www/wa-omni-gateway
nano .env
```

Adicionar no final:
```
ADMIN_PASSWORD=<senha-forte-aqui>
```

Salvar (`Ctrl+O`, `Enter`, `Ctrl+X`).

- [ ] **Step 3: Reiniciar o serviço**

```bash
sudo systemctl restart wa-gateway
```

- [ ] **Step 4: Push para deploy automático**

```bash
# Na máquina local
git push origin main
```

O GitHub Actions vai fazer o deploy automaticamente. Aguardar ~1 minuto e acessar `https://gateway.harucode.com.br/admin`.

---

## Resumo dos arquivos

| Arquivo | Ação |
|---------|------|
| `src/config/env.ts` | Modificar — adiciona `ADMIN_PASSWORD` |
| `.env.example` | Modificar — documenta `ADMIN_PASSWORD` |
| `src/utils/session.ts` | Criar — funções puras de geração/verificação de token |
| `src/utils/session.test.ts` | Criar — testes dos utilitários de sessão |
| `src/pages/admin-login.ts` | Criar — HTML da tela de login |
| `src/pages/admin-dashboard.ts` | Criar — HTML do dashboard com tabela e formulário |
| `src/controllers/admin.controller.ts` | Criar — handlers e função `validateClientInput` exportada |
| `src/controllers/admin.controller.test.ts` | Criar — testes da validação |
| `src/routes/router.ts` | Modificar — adiciona bloco `/admin/*` |
