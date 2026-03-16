import { test, expect, mock, beforeEach, afterAll } from "bun:test";

// Capture real references before mock.module (Bun v1.3.10 module mock isolation workaround)
import * as _metaOAuthNS from "../services/meta-oauth.service";
const _realExchangeCode_job = _metaOAuthNS.exchangeCode;
const _realListPhoneNumbers_job = _metaOAuthNS.listPhoneNumbers;
const _realRenewToken_job = _metaOAuthNS.renewToken;
const _RealMetaOAuthError_job = _metaOAuthNS.MetaOAuthError;

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

afterAll(() => {
  mock.module("../services/meta-oauth.service", () => ({
    exchangeCode: _realExchangeCode_job,
    listPhoneNumbers: _realListPhoneNumbers_job,
    renewToken: _realRenewToken_job,
    MetaOAuthError: _RealMetaOAuthError_job,
  }));
});

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
  await expect(runTokenRefreshJob()).resolves.toBeUndefined();
  expect(mockSetTokenExpired).toHaveBeenCalledTimes(2);
});
