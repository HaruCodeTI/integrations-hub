// src/controllers/panel.controller.test.ts
import { test, expect, describe, mock, beforeAll, beforeEach, afterAll } from "bun:test";
import { generateSessionToken } from "../utils/session";

// ─── Helpers ────────────────────────────────────────────────

const TEST_PASSWORD = "test-admin-password";
const SESSION_COOKIE = "admin_session";

function makeAuthCookie(): string {
  const token = generateSessionToken(TEST_PASSWORD);
  return `${SESSION_COOKIE}=${token}`;
}

function makeRequest(pathname: string, options: RequestInit = {}): Request {
  return new Request(`http://localhost${pathname}`, options);
}

function makeAuthRequest(pathname: string, options: RequestInit = {}): Request {
  const existing = (options.headers as Record<string, string>) ?? {};
  return new Request(`http://localhost${pathname}`, {
    ...options,
    headers: { ...existing, cookie: makeAuthCookie() },
  });
}

// ─── Mocks ──────────────────────────────────────────────────

const mockDb = {
  getActiveClients: mock(),
  getAllClients: mock(),
  getClientByPhoneId: mock(),
  getClientByGhlLocationId: mock(),
  getClientById: mock(),
  createClient: mock(),
  updateClient: mock(),
  deleteClient: mock(),
  addSignupToken: mock(),
  getSignupToken: mock(),
  setPendingToken: mock(),
  markTokenUsed: mock(),
  createClientsFromSignup: mock(),
  upsertGhlLocation: mock(),
  getGhlLocation: mock(),
  getAllGhlLocations: mock(),
  deleteGhlLocation: mock(),
  getGhlContact: mock(),
  upsertGhlContact: mock(),
  saveMessageMapping: mock(),
  getMessageMapping: mock(),
  cleanOldMappings: mock(),
  saveMessage: mock(),
  updateMessageStatus: mock(),
  listConversations: mock(),
  getMessages: mock(),
  getExpiringTokens: mock(),
  updateClientToken: mock(),
  setTokenExpired: mock(),
};

let appRouter: (req: Request) => Promise<Response>;

beforeAll(async () => {
  // RouterService chama db.getActiveClients() no construtor (ao importar o módulo).
  // Precisamos que o mock retorne um array antes de qualquer import do router.
  mockDb.getActiveClients.mockReturnValue([]);
  mockDb.getAllClients.mockReturnValue([]);

  mock.module("../services/db.service", () => ({ db: mockDb }));
  mock.module("../config/env", () => ({
    env: {
      ADMIN_PASSWORD: TEST_PASSWORD,
      GATEWAY_API_KEY: "test-api-key",
      META_APP_ID: "app-id",
      META_APP_SECRET: "secret",
      GATEWAY_PUBLIC_URL: "https://gw.test",
      META_VERIFY_TOKEN: "",
      WEBHOOK_URL_N8N: "",
      GHL_CLIENT_ID: "",
      GHL_CLIENT_SECRET: "",
      GHL_CONVERSATION_PROVIDER_ID: "",
      GHL_APP_VERSION_ID: "",
      GHL_SCOPES: "",
    },
  }));
  // Stubs para dependências pesadas que o router importa indiretamente
  mock.module("../services/media.service", () => ({
    mediaService: { serveMedia: mock() },
  }));
  mock.module("../services/meta-oauth.service", () => ({
    exchangeCode: mock(),
    listPhoneNumbers: mock(),
    renewToken: mock(),
    MetaOAuthError: class MetaOAuthError extends Error {},
  }));
  appRouter = (await import("../routes/router")).appRouter;
});

afterAll(() => {
  // Sem restauração necessária — cada arquivo de teste usa seu próprio escopo de mock.module.
  // O workaround do Bun v1.3.10 (capturar refs reais) aplica-se apenas a módulos
  // que outros testes dependem no mesmo worker; aqui não há conflito.
});

beforeEach(() => {
  mockDb.getActiveClients.mockReset();
  mockDb.getAllClients.mockReset();
});

// ─── GET /api/v2/accounts — sem autenticação ─────────────────

describe("GET /api/v2/accounts", () => {
  test("retorna 401 JSON quando nao autenticado", async () => {
    const res = await appRouter(makeRequest("/api/v2/accounts"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Nao autenticado" });
  });

  test("retorna 200 com array de contas quando autenticado", async () => {
    mockDb.getAllClients.mockReturnValue([
      { id: "c1", name: "Empresa A", phone_number_id: "111", client_type: "webhook", active: 1 },
      { id: "c2", name: "Empresa B", phone_number_id: "222", client_type: "ghl", active: 1 },
    ]);

    const res = await appRouter(makeAuthRequest("/api/v2/accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: "c1",
      name: "Empresa A",
      phone_number_id: "111",
      client_type: "webhook",
      active: 1,
    });
    expect(body[1]).toEqual({
      id: "c2",
      name: "Empresa B",
      phone_number_id: "222",
      client_type: "ghl",
      active: 1,
    });
  });

  test("retorna 200 com array vazio quando nao ha clientes ativos", async () => {
    mockDb.getAllClients.mockReturnValue([]);

    const res = await appRouter(makeAuthRequest("/api/v2/accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("resposta inclui apenas os campos mapeados (sem meta_token, webhook_url, etc)", async () => {
    mockDb.getAllClients.mockReturnValue([
      {
        id: "c1",
        name: "Empresa A",
        phone_number_id: "111",
        client_type: "ghl",
        meta_token: "EAA-should-not-appear",
        webhook_url: "https://secret.webhook.com",
        active: 1,
        auth_token: null,
      },
    ]);

    const res = await appRouter(makeAuthRequest("/api/v2/accounts"));
    const body = await res.json();
    const keys = Object.keys(body[0]);
    expect(keys).toContain("id");
    expect(keys).toContain("name");
    expect(keys).toContain("phone_number_id");
    expect(keys).toContain("client_type");
    expect(keys).not.toContain("meta_token");
    expect(keys).not.toContain("webhook_url");
    expect(keys).not.toContain("auth_token");
  });
});

// ─── GET /api/v2/<rota-desconhecida> ────────────────────────

describe("GET /api/v2/<rota desconhecida>", () => {
  test("retorna 404 JSON quando autenticado e rota nao existe", async () => {
    const res = await appRouter(makeAuthRequest("/api/v2/unknown-route"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Rota v2 nao encontrada" });
  });

  test("retorna 401 antes de verificar rota quando nao autenticado", async () => {
    const res = await appRouter(makeRequest("/api/v2/unknown-route"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Nao autenticado" });
  });
});

// ─── GET /painel ─────────────────────────────────────────────

describe("GET /painel", () => {
  test("redireciona para /admin/login quando nao autenticado", async () => {
    const res = await appRouter(makeRequest("/painel"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
  });

  test("serve o painel (nao redireciona) quando autenticado", async () => {
    const res = await appRouter(makeAuthRequest("/painel"));
    // Deve ser 200 (Bun.file é lazy — erro de arquivo surge só ao consumir o body)
    expect(res.status).toBe(200);
  });

  test("subpaths de /painel/ redirecionam quando nao autenticado", async () => {
    const res = await appRouter(makeRequest("/painel/conversations"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
  });

  test("subpaths de /painel/ sao servidos quando autenticado", async () => {
    const res = await appRouter(makeAuthRequest("/painel/conversations"));
    expect(res.status).toBe(200);
  });
});
