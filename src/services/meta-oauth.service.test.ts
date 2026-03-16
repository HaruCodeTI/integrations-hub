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
