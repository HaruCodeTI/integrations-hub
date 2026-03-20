// src/frontend/pages/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Send, CheckCircle, BookOpen, Megaphone } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface DashboardMetrics {
  messages_sent_7d: number;
  delivery_rate: number;
  read_rate: number;
  active_campaigns: number;
  recent_campaigns: Array<{
    id: string;
    name: string;
    status: string;
    total_contacts: number;
    sent: number;
    delivered: number;
  }>;
}

interface Account { id: string; name: string; phone_number_id: string; }

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  done: 'success', running: 'info', paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        if (data.length > 0) setSelectedId(data[0].phone_number_id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/v2/dashboard/${selectedId}`)
      .then(r => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const metricCards = metrics ? [
    { label: 'Enviadas (7d)', value: metrics.messages_sent_7d, icon: Send, color: 'text-primary' },
    { label: 'Taxa de Entrega', value: `${metrics.delivery_rate}%`, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Taxa de Leitura', value: `${metrics.read_rate}%`, icon: BookOpen, color: 'text-blue-600' },
    { label: 'Campanhas Ativas', value: metrics.active_campaigns, icon: Megaphone, color: 'text-orange-500' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header com seletor de conta */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          {accounts.map(a => (
            <option key={a.phone_number_id} value={a.phone_number_id}>{a.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando métricas...</p>}

      {/* Metric cards */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-bg-default ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{value}</p>
                  <p className="text-xs text-text-secondary">{label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Campanhas recentes */}
      {metrics && metrics.recent_campaigns.length > 0 && (
        <Card padding="lg">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Campanhas Recentes</h2>
          <div className="space-y-3">
            {metrics.recent_campaigns.map(c => {
              const pct = c.total_contacts > 0 ? Math.round((c.sent / c.total_contacts) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-primary">{c.name}</span>
                    <Badge variant={statusVariant[c.status] ?? 'default'}>
                      {statusLabel[c.status] ?? c.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-default rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-text-tertiary">{c.sent}/{c.total_contacts}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {metrics && metrics.recent_campaigns.length === 0 && !loading && (
        <Card>
          <p className="text-sm text-text-secondary text-center py-4">Nenhuma campanha ainda.</p>
        </Card>
      )}
    </div>
  );
}
