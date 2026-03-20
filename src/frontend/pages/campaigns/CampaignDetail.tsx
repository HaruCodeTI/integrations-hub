// src/frontend/pages/campaigns/CampaignDetail.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, BookOpen, Users, XCircle, MessageSquare } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  template_name: string;
  created_at: string;
}

interface Metrics {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
}

interface Contact {
  id: number;
  phone: string;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  error_message: string | null;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  done: 'success', running: 'info', paused: 'warning', cancelled: 'error', pending: 'default',
};
const statusLabel: Record<string, string> = {
  done: 'Concluída', running: 'Em andamento', paused: 'Pausada', cancelled: 'Cancelada', pending: 'Pendente',
};
const contactStatusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  sent: 'info', delivered: 'success', read: 'success', failed: 'error', pending: 'default', cancelled: 'default',
};
const contactStatusLabel: Record<string, string> = {
  pending: 'Pendente', sent: 'Enviado', delivered: 'Entregue', read: 'Lido', failed: 'Falhou', cancelled: 'Cancelado',
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [cRes, ctRes] = await Promise.all([
        fetch(`/api/v2/campaigns/${id}`),
        fetch(`/api/v2/campaigns/${id}/contacts?page=${page}`),
      ]);
      const cData = await cRes.json() as any;
      const ctData = await ctRes.json() as any;
      setCampaign(cData.campaign ?? cData);
      setMetrics(cData.metrics ?? null);
      setContacts(Array.isArray(ctData) ? ctData : ctData.contacts ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (campaign?.status !== 'running') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [campaign?.status, load]);

  const doAction = async (action: string) => {
    try {
      const res = await fetch(`/api/v2/campaigns/${id}/${action}`, { method: 'POST' });
      if (!res.ok) { const e = await res.json() as any; alert(e.error ?? 'Erro'); return; }
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="p-6 text-sm text-text-secondary">Carregando...</div>;
  if (!campaign) return <div className="p-6 text-sm text-red-600">Campanha não encontrada.</div>;

  // Client-side filtering since the API doesn't support ?status= on contacts
  const filteredContacts = filterStatus
    ? contacts.filter(c => c.status === filterStatus)
    : contacts;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/painel/campanhas')} className="text-text-tertiary hover:text-text-primary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-text-primary flex-1 min-w-0 truncate">{campaign.name}</h1>
        <Badge variant={statusVariant[campaign.status] ?? 'default'}>
          {statusLabel[campaign.status] ?? campaign.status}
        </Badge>
        {campaign.status === 'running' && (
          <Button variant="secondary" size="sm" onClick={() => doAction('pause')}>Pausar</Button>
        )}
        {campaign.status === 'paused' && (
          <Button size="sm" onClick={() => doAction('resume')}>Retomar</Button>
        )}
        {['running', 'paused', 'pending'].includes(campaign.status) && (
          <Button variant="danger" size="sm" onClick={() => doAction('cancel')}>Cancelar</Button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: metrics?.total ?? campaign.total_contacts, icon: Users, color: 'text-text-secondary' },
          { label: 'Enviado', value: metrics?.sent ?? 0, icon: Send, color: 'text-primary' },
          { label: 'Entregue', value: metrics?.delivered ?? 0, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Lido', value: metrics?.read ?? 0, icon: BookOpen, color: 'text-blue-600' },
          { label: 'Falhas', value: metrics?.failed ?? 0, icon: XCircle, color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <div className="flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-text-primary">{value}</p>
                <p className="text-xs text-text-secondary">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabela de contatos */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">Contatos</h2>
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40">
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="sent">Enviado</option>
            <option value="delivered">Entregue</option>
            <option value="read">Lido</option>
            <option value="failed">Falhou</option>
            <option value="cancelled">Cancelado</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-secondary">
                <th className="text-left py-2 pr-4 font-medium">Telefone</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-left py-2 pr-4 font-medium">Enviado em</th>
                <th className="text-left py-2 pr-4 font-medium">Lido em</th>
                <th className="text-left py-2 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => navigate(`/painel/conversas/${c.phone}`)}
                      className="flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
                      title="Abrir conversa"
                    >
                      {c.phone}
                      <MessageSquare className="h-3 w-3 shrink-0" />
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={contactStatusVariant[c.status] ?? 'default'}>
                      {contactStatusLabel[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-text-tertiary text-xs">
                    {c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 pr-4 text-text-tertiary text-xs">
                    {c.read_at ? new Date(c.read_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 text-red-600 text-xs">{c.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredContacts.length === 0 && (
            <p className="text-sm text-text-secondary py-4 text-center">Nenhum contato encontrado.</p>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-border rounded text-sm disabled:opacity-40 text-text-secondary hover:text-text-primary"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-text-tertiary">Página {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={contacts.length < 50}
            className="px-3 py-1 border border-border rounded text-sm disabled:opacity-40 text-text-secondary hover:text-text-primary"
          >
            Próxima
          </button>
        </div>
      </Card>
    </div>
  );
}
