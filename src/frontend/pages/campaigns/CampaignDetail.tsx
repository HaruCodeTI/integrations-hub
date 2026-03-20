import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';

interface Campaign {
  id: string;
  name: string;
  status: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  scheduled_at?: string;
}

interface Contact {
  id: string;
  phone: string;
  status: string;
  wamid?: string;
  error_message?: string;
  sent_at?: string;
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v2/campaigns/${id}`)
      .then(r => r.json())
      .then(data => { setCampaign(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v2/campaigns/${id}/contacts?page=${page}`)
      .then(r => r.json())
      .then(data => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [id, page]);

  async function doAction(action: 'pause' | 'resume' | 'cancel') {
    if (!id) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/campaigns/${id}/${action}`, { method: 'POST' });
      if (!res.ok) { setError('Erro ao executar ação'); return; }
      // Refresh campaign
      const updated = await fetch(`/api/v2/campaigns/${id}`).then(r => r.json());
      setCampaign(updated);
    } catch {
      setError('Erro de conexão');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  if (!campaign) return <div className="p-6 text-sm text-red-500">Campanha não encontrada.</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/painel/campanhas')} className="text-gray-400 hover:text-gray-600">
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">{campaign.name}</h1>
          <div className="text-sm text-gray-400">{campaign.template_name} · {campaign.template_language}</div>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total</div>
          <div className="text-2xl font-semibold text-gray-900">{campaign.total_contacts}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Enviados</div>
          <div className="text-2xl font-semibold text-green-600">{campaign.sent_count}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Falhas</div>
          <div className="text-2xl font-semibold text-red-500">{campaign.failed_count}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        {campaign.status === 'running' && (
          <button
            onClick={() => doAction('pause')}
            disabled={actionLoading}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Pausar
          </button>
        )}
        {campaign.status === 'paused' && (
          <button
            onClick={() => doAction('resume')}
            disabled={actionLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Retomar
          </button>
        )}
        {(campaign.status === 'running' || campaign.status === 'paused') && (
          <button
            onClick={() => { if (confirm('Cancelar campanha?')) doAction('cancel'); }}
            disabled={actionLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-red-500 text-sm">{error}</div>}

      {/* Contacts Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 font-medium text-sm text-gray-700">Contatos</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Telefone</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Enviado em</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Erro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map(c => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-gray-900">{c.phone}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-gray-400">
                  {c.sent_at ? new Date(c.sent_at).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-red-500 text-xs">{c.error_message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-500">Página {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={contacts.length < 50}
            className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
