import { timingSafeEqual } from "crypto";
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
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${8 * 3600}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
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

    const submittedBuf = Buffer.from(submitted || "");
    const passwordBuf = Buffer.from(password);
    const match = submittedBuf.length === passwordBuf.length &&
      timingSafeEqual(submittedBuf, passwordBuf);
    if (!match) {
      return html(adminLoginHTML("Senha incorreta."));
    }

    const cookie = setSessionCookie(password);
    return new Response(null, {
      status: 302,
      headers: { Location: "/painel", "Set-Cookie": cookie },
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
    const signupLinkParam = url.searchParams.get("signup_link");

    let message: { type: "success" | "error"; text: string } | undefined;
    if (successParam === "1") message = { type: "success", text: "Cliente cadastrado com sucesso!" };
    if (errorParam) message = { type: "error", text: decodeURIComponent(errorParam) };

    return html(adminDashboardHTML(clients, message, undefined, signupLinkParam ?? undefined));
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

  static generateSignupLink(): Response {
    const tokenId = db.addSignupToken();
    const url = `${env.GATEWAY_PUBLIC_URL}/signup/${tokenId}`;
    return new Response(null, {
      status: 302,
      headers: { Location: `/admin?signup_link=${encodeURIComponent(url)}` },
    });
  }
}
