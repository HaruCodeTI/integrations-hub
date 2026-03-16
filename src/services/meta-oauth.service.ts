const META_API = "https://graph.facebook.com/v21.0";

export class MetaOAuthError extends Error {
  constructor(public readonly metaMessage: string) {
    super(`Meta API error: ${metaMessage}`);
    this.name = "MetaOAuthError";
  }
}

export type TokenResult = { access_token: string; expires_in: number };
export type PhoneNumber = { id: string; display_phone_number: string; verified_name: string };

async function metaGet(url: string): Promise<any> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new MetaOAuthError(data?.error?.message ?? "Unknown error");
  return data;
}

/**
 * Troca o code do Embedded Signup por um long-lived token (~60 dias).
 * Faz duas chamadas GET à Meta Graph API (token exchange aceita query params via GET).
 */
export async function exchangeCode(code: string, appId: string, appSecret: string): Promise<TokenResult> {
  const shortUrl = `${META_API}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const short = await metaGet(shortUrl);

  const longUrl = `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(short.access_token)}`;
  const long = await metaGet(longUrl);
  return { access_token: long.access_token, expires_in: long.expires_in ?? 5184000 };
}

/** Lista os números de WhatsApp de um WABA. */
export async function listPhoneNumbers(wabaId: string, accessToken: string): Promise<PhoneNumber[]> {
  const url = `${META_API}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(accessToken)}`;
  const data = await metaGet(url);
  return data.data ?? [];
}

/** Renova um long-lived token. Usa expires_in da resposta para calcular novo prazo. */
export async function renewToken(currentToken: string, appId: string, appSecret: string): Promise<TokenResult> {
  const url = `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const data = await metaGet(url);
  return { access_token: data.access_token, expires_in: data.expires_in ?? 5184000 };
}
