import { test, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";

// Captura referências às funções REAIS antes de qualquer mock.module.
// Necessário porque: (1) mock.restore() no Bun v1.3.10 não restaura mock.module,
// e (2) módulo namespace é live binding — lê o mock após beforeAll chamar mock.module.
import * as _metaOAuthNS from "../services/meta-oauth.service";
const _realExchangeCode = _metaOAuthNS.exchangeCode;
const _realListPhoneNumbers = _metaOAuthNS.listPhoneNumbers;
const _realRenewToken = _metaOAuthNS.renewToken;
const _RealMetaOAuthError = _metaOAuthNS.MetaOAuthError;

const mockDb = {
  getSignupToken: mock(),
  setPendingToken: mock(),
  markTokenUsed: mock(),
  createClientsFromSignup: mock(),
};
const mockExchangeCode = mock();
const mockListPhoneNumbers = mock();
class MockMetaOAuthError extends Error { constructor(msg: string) { super(msg); this.name = "MetaOAuthError"; } }

let SignupController: any;

beforeAll(async () => {
  mock.module("../services/db.service", () => ({ db: mockDb }));
  mock.module("../services/meta-oauth.service", () => ({
    exchangeCode: mockExchangeCode, listPhoneNumbers: mockListPhoneNumbers,
    MetaOAuthError: MockMetaOAuthError,
    renewToken: mock(),
  }));
  mock.module("../config/env", () => ({
    env: { META_APP_ID: "app-id", META_APP_SECRET: "secret", GATEWAY_PUBLIC_URL: "https://gw.test" },
  }));
  SignupController = (await import("./signup.controller")).SignupController;
});

afterAll(() => {
  // Restaura com as referências capturadas ANTES do mock (não lê do namespace live).
  mock.module("../services/meta-oauth.service", () => ({
    exchangeCode: _realExchangeCode,
    listPhoneNumbers: _realListPhoneNumbers,
    renewToken: _realRenewToken,
    MetaOAuthError: _RealMetaOAuthError,
  }));
});

beforeEach(() => {
  mockDb.getSignupToken.mockReset(); mockDb.setPendingToken.mockReset();
  mockDb.markTokenUsed.mockReset(); mockDb.createClientsFromSignup.mockReset();
  mockExchangeCode.mockReset(); mockListPhoneNumbers.mockReset();
});

// --- showSignup ---

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

// --- exchangeCode ---

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

// --- confirmNumbers ---

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
