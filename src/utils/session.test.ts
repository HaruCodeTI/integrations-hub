import { test, expect, describe } from "bun:test";
import { generateSessionToken, verifySessionToken } from "./session";

describe("generateSessionToken", () => {
  test("retorna string no formato payload.mac", () => {
    const token = generateSessionToken("minha-senha");
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/);
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

  test("rejeita token expirado (> 8h)", async () => {
    const password = "senha";
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
