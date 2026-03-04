import { env } from '../config/env';
import { db } from './db.service';

const GHL_AUTH_BASE = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';

export interface GhlTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: string;
  locationId?: string;
  companyId?: string;
}

class GhlOAuthService {

  /**
   * Gera a URL de instalação do app GHL.
   * O admin da sub-account clica nessa URL → autoriza → GHL redireciona para /ghl/oauth/callback
   */
  getInstallUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: `${env.GATEWAY_PUBLIC_URL}/integrations/oauth/callback`,
      client_id: env.GHL_CLIENT_ID,
      scope: env.GHL_SCOPES,
    });
    return `${GHL_AUTH_BASE}?${params.toString()}`;
  }

  /**
   * Troca o authorization code por access_token + refresh_token
   */
  async exchangeCode(code: string): Promise<GhlTokenResponse> {
    const response = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GHL_CLIENT_ID,
        client_secret: env.GHL_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.GATEWAY_PUBLIC_URL}/integrations/oauth/callback`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GHL OAuth exchange failed: ${response.status} — ${error}`);
    }

    return await response.json() as GhlTokenResponse;
  }

  /**
   * Renova o access_token usando o refresh_token
   */
  async refreshToken(refreshToken: string): Promise<GhlTokenResponse> {
    const response = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GHL_CLIENT_ID,
        client_secret: env.GHL_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GHL OAuth refresh failed: ${response.status} — ${error}`);
    }

    return await response.json() as GhlTokenResponse;
  }

  /**
   * Retorna um access_token válido para um locationId.
   * Se o token estiver expirado, renova automaticamente.
   */
  async getValidToken(locationId: string): Promise<string> {
    const location = db.getGhlLocation(locationId);
    if (!location) {
      throw new Error(`GHL location não encontrada: ${locationId}`);
    }

    const expiresAt = new Date(location.expires_at);
    const now = new Date();

    // Renova 5 minutos antes de expirar
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log(`[🔄 GHL OAuth] Renovando token para location ${locationId}...`);
      const tokens = await this.refreshToken(location.refresh_token);
      this.saveTokens(tokens);
      return tokens.access_token;
    }

    return location.access_token;
  }

  /**
   * Salva os tokens no banco
   */
  saveTokens(tokens: GhlTokenResponse): void {
    const locationId = tokens.locationId;
    if (!locationId) {
      console.warn('[⚠️ GHL OAuth] Token sem locationId — ignorando save.');
      return;
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    db.upsertGhlLocation({
      location_id: locationId,
      company_id: tokens.companyId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    });

    console.log(`[✅ GHL OAuth] Tokens salvos para location ${locationId} (expira em ${tokens.expires_in}s)`);
  }
}

export const ghlOAuth = new GhlOAuthService();
