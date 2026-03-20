// src/modules/health/health.service.ts
import { db } from '../../services/db.service';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

// Rastreia o último webhook recebido em memória (reseta no restart)
let lastWebhookAt: string | null = null;
export function recordWebhookReceived() {
  lastWebhookAt = new Date().toISOString();
}

const TIER_LABEL: Record<string, string> = {
  TIER_50: '50/dia',
  TIER_250: '250/dia',
  TIER_1K: '1.000/dia',
  TIER_10K: '10.000/dia',
  TIER_100K: '100.000/dia',
  TIER_UNLIMITED: 'Ilimitado',
};

const QUALITY_LABEL: Record<string, string> = {
  GREEN: 'Alta',
  YELLOW: 'Média',
  RED: 'Baixa',
  UNKNOWN: 'Desconhecida',
};

async function fetchAccountStatus(phone_number_id: string, token: string) {
  try {
    const res = await fetch(
      `${GRAPH_URL}/${phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json() as any;
    if (data.error) return { token_valid: false, error: data.error.message as string };
    return {
      token_valid: true,
      display_phone_number: (data.display_phone_number ?? null) as string | null,
      verified_name: (data.verified_name ?? null) as string | null,
      quality_rating: (data.quality_rating ?? 'UNKNOWN') as string,
      quality_label: QUALITY_LABEL[data.quality_rating as string] ?? 'Desconhecida',
      tier: (data.messaging_limit_tier ?? null) as string | null,
      tier_label: TIER_LABEL[data.messaging_limit_tier as string] ?? data.messaging_limit_tier ?? '—',
    };
  } catch {
    return { token_valid: false, error: 'Erro de conexão com a Meta' };
  }
}

export async function getHealthData() {
  const clients = db.getAllClients();
  const todayMetrics = db.getTodayGlobalMetrics();

  const accounts = await Promise.all(
    clients.map(async (client) => {
      const meta = await fetchAccountStatus(client.phone_number_id, client.meta_token);
      return {
        id: client.id,
        name: client.name,
        phone_number_id: client.phone_number_id,
        active: client.active,
        sent_today: db.countSentToday(client.phone_number_id),
        ...meta,
      };
    })
  );

  return {
    uptime_seconds: Math.floor(process.uptime()),
    last_webhook_at: lastWebhookAt,
    metrics_today: todayMetrics,
    accounts,
  };
}
