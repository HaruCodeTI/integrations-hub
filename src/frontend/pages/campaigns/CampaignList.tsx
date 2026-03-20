import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSelector from '../../components/AccountSelector';
import StatusBadge from '../../components/StatusBadge';

interface Campaign {
  id: string;
  name: string;
  status: string;
  phone_number_id: string;
  template_name: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  scheduled_at?: string;
}

export default function CampaignList() {
  const [phoneId, setPhoneId] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!phoneId) return;
    setLoading(true);
    fetch(`/api/v2/campaigns?phone_number_id=${encodeURIComponent(phoneId)}`)
      .then(r => r.json())
      .then(data => { setCampaigns(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [phoneId]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Campanhas</h1>
        <button
          onClick={() => navigate('/painel/campanhas/nova')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Nova Campanha
        </button>
      </div>

      <div className="mb-4">
        <AccountSelector value={phoneId} onChange={setPhoneId} label="Conta WhatsApp" />
      </div>

      {loading && <div className="text-sm text-gray-400">Carregando...</div>}

      {!loading && phoneId && campaigns.length === 0 && (
        <div className="text-sm text-gray-400">Nenhuma campanha encontrada.</div>
      )}

      {campaigns.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Template</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Progresso</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/painel/campanhas/${c.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.template_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.sent_count}/{c.total_contacts}
                    {c.failed_count > 0 && (
                      <span className="ml-2 text-red-500">({c.failed_count} falhas)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
