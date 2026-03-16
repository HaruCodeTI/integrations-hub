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
