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
      console.log(`[token-refresh] Cliente ${client.id} renovado.`);
    } catch (err) {
      console.error(`[token-refresh] Falha ao renovar cliente ${client.id}:`, err);
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
