// src/frontend/pages/settings/Settings.tsx
import React, { useState, useEffect } from 'react';
import { Copy, Check, Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

interface AccountHealth {
  id: string;
  name: string;
  phone_number_id: string;
  active: number;
  sent_today: number;
  token_valid: boolean;
  error?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  quality_label?: string;
  tier?: string;
  tier_label?: string;
}

interface HealthData {
  uptime_seconds: number;
  last_webhook_at: string | null;
  metrics_today: { sent: number; failed: number; campaigns_running: number };
  accounts: AccountHealth[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
      }}
      className="p-1.5 rounded hover:bg-bg-default text-text-tertiary transition-colors shrink-0"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function qualityVariant(rating?: string): 'success' | 'warning' | 'error' | 'default' {
  if (rating === 'GREEN') return 'success';
  if (rating === 'YELLOW') return 'warning';
  if (rating === 'RED') return 'error';
  return 'default';
}

export default function Settings() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/v2/health').then(r => r.json()),
      fetch('/api/v2/config').then(r => r.json()),
    ])
      .then(([h, c]) => {
        setHealth(h as HealthData);
        setWebhookUrl((c as any).webhook_url ?? '');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (error) return <div className="p-6 text-sm text-red-600">Erro ao carregar: {error}</div>;
  if (loading || !health) return <div className="p-6 text-sm text-text-secondary">Carregando...</div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Configurações</h1>
        <button onClick={load} className="text-text-tertiary hover:text-text-primary p-1.5 rounded" title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Sistema */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Sistema</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-text-secondary mb-1">Status</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700">Online</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Uptime</p>
            <p className="text-sm font-medium text-text-primary">{formatUptime(health.uptime_seconds)}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Disparos hoje</p>
            <p className="text-sm font-medium text-text-primary">{health.metrics_today.sent}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Falhas hoje</p>
            <p className={`text-sm font-medium ${health.metrics_today.failed > 0 ? 'text-red-600' : 'text-text-primary'}`}>
              {health.metrics_today.failed}
            </p>
          </div>
        </div>
      </Card>

      {/* Webhook */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Webhook</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-text-secondary mb-1">URL do Webhook</p>
            <div className="flex items-center gap-2 bg-bg-default rounded-lg px-3 py-2">
              <code className="text-sm text-text-primary flex-1 min-w-0 truncate">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Último evento recebido</p>
            <div className="flex items-center gap-2">
              {health.last_webhook_at ? (
                <>
                  <Wifi className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-text-primary">
                    {new Date(health.last_webhook_at).toLocaleString('pt-BR')}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-text-tertiary shrink-0" />
                  <span className="text-sm text-text-secondary">Nenhum evento desde o último restart</span>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Contas Meta */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Contas Meta</h2>
        <div className="space-y-3">
          {health.accounts.map(acc => (
            <Card key={acc.id} padding="lg">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-text-primary text-sm">{acc.name}</p>
                  <p className="text-xs text-text-tertiary">{acc.display_phone_number ?? acc.phone_number_id}</p>
                  {acc.verified_name && <p className="text-xs text-text-tertiary">Verificado como: {acc.verified_name}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={acc.active ? 'success' : 'default'}>{acc.active ? 'Ativa' : 'Inativa'}</Badge>
                  {acc.token_valid
                    ? <Badge variant="success">Token válido</Badge>
                    : <Badge variant="error">Token inválido</Badge>
                  }
                </div>
              </div>

              {acc.token_valid ? (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Qualidade</p>
                    <Badge variant={qualityVariant(acc.quality_rating)}>
                      {acc.quality_label ?? '—'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Limite de envio</p>
                    <p className="text-sm font-medium text-text-primary">{acc.tier_label ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Enviados hoje</p>
                    <p className="text-sm font-medium text-text-primary">{acc.sent_today}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-red-600 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {acc.error ?? 'Token inválido ou expirado'}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
