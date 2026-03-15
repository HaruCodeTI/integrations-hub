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
    expect(result.data?.ghl_location_id).toBeNull();
  });
});
