// src/frontend/pages/campaigns/CampaignList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Megaphone } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  sent_count: number; // enriched by backend from campaign_contacts metrics
  created_at: string;
  phone_number_id: string;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  done: 'success', running: 'info', paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};

export default function CampaignList() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/campaigns')
      .then(r => r.json())
      .then(data => setCampaigns(Array.isArray(data) ? data : data.campaigns ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = campaigns.length;
  const active = campaigns.filter(c => ['running', 'paused', 'pending'].includes(c.status)).length;
  const done = campaigns.filter(c => c.status === 'done').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Campanhas</h1>
        <Button onClick={() => navigate('/painel/campanhas/nova')}>
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: total },
          { label: 'Ativas', value: active },
          { label: 'Concluídas', value: done },
        ].map(({ label, value }) => (
          <Card key={label} padding="sm" className="text-center">
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="text-xs text-text-secondary">{label}</p>
          </Card>
        ))}
      </div>

      {loading && <p className="text-sm text-text-secondary">Carregando...</p>}

      <div className="space-y-3">
        {campaigns.map(c => {
          const sent = c.sent_count ?? 0;
          const pct = c.total_contacts > 0 ? Math.round((sent / c.total_contacts) * 100) : 0;
          return (
            <Card key={c.id} hover onClick={() => navigate(`/painel/campanhas/${c.id}`)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary text-sm truncate">{c.name}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Badge variant={statusVariant[c.status] ?? 'default'}>
                  {statusLabel[c.status] ?? c.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-bg-default rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-text-tertiary shrink-0">{sent}/{c.total_contacts}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {!loading && campaigns.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <Megaphone className="h-10 w-10 mx-auto mb-3 text-text-tertiary" />
          <p className="font-medium">Nenhuma campanha criada</p>
          <p className="text-sm mt-1">Clique em "Nova Campanha" para começar</p>
        </div>
      )}
    </div>
  );
}
