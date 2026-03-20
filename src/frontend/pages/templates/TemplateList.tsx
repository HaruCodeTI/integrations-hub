import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSelector from '../../components/AccountSelector';
import StatusBadge from '../../components/StatusBadge';

interface Template {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: any[];
}

const CATEGORY_ICONS: Record<string, string> = {
  MARKETING: '📢', UTILITY: '⚙️', AUTHENTICATION: '🔒',
};

export default function TemplateList() {
  const navigate = useNavigate();
  const [phoneId, setPhoneId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function load(pid: string) {
    if (!pid) return;
    setLoading(true);
    fetch(`/api/v2/templates/${pid}`)
      .then(r => r.json())
      .then(data => { setTemplates(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(phoneId); }, [phoneId]);

  async function handleDelete(name: string) {
    if (!confirm(`Excluir template "${name}"?`)) return;
    setDeleting(name);
    await fetch(`/api/v2/templates/${phoneId}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setDeleting(null);
    load(phoneId);
  }

  function getBodyPreview(components: any[] = []): string {
    const body = components.find(c => c.type === 'BODY');
    return body?.text ?? '';
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-gray-500">Gerencie templates de mensagem da Meta API</p>
        </div>
        {phoneId && (
          <button
            onClick={() => navigate(`/painel/templates/novo?phone=${phoneId}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            + Novo Template
          </button>
        )}
      </div>

      <div className="mb-4 max-w-xs">
        <AccountSelector value={phoneId} onChange={setPhoneId} label="Conta" />
      </div>

      {loading && <div className="text-sm text-gray-400">Buscando templates...</div>}

      {!loading && templates.length === 0 && phoneId && (
        <div className="text-sm text-gray-400">Nenhum template encontrado.</div>
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.name} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{CATEGORY_ICONS[t.category] ?? '📋'}</span>
                <span className="font-medium text-sm">{t.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.category}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.language}</span>
                <StatusBadge status={t.status} />
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">{getBodyPreview(t.components)}</p>
            </div>
            <button
              onClick={() => handleDelete(t.name)}
              disabled={deleting === t.name}
              className="ml-4 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {deleting === t.name ? '...' : 'Excluir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
